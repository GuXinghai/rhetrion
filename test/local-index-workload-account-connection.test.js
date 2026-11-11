import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {readFile,writeFile} from 'node:fs/promises';
import {createWorkspace} from './helpers/local-index-facts.js';
import {refreshLocalIndex} from '../src/local-index-refresh.js';
import {commitLocalCollectorState} from '../src/local-collector-state.js';
import {readWorkloadQuotaEvidence,readLocalIndexWorkload,workloadState,workloadStateStore} from '../src/local-index-backend.js';
import {openLocalIndexStore} from '../src/local-index-store.js';
import {codexPrimaryAllowanceBasis} from '../src/codex-primary-allowance-basis.js';
const at=Date.parse('2026-10-15T12:00:00Z'),M=60_000;
const token=scope=>createHash('sha256').update(scope).digest('hex');
const scopes=['synthetic-connection-a','synthetic-connection-b'];
const snapshot=(minute,scope,used,planType='pro')=>({schemaVersion:'0.3',kind:'codex_quota_snapshot',provider:'openai_codex',
  eventKey:`connection-${minute}-${scope}-${used}`,source:'app_server_read',observedAt:new Date(at+minute*M).toISOString(),
  accountScope:scope===null?{status:'unavailable'}:{status:'available',version:'openai-account-v1',scopeId:scope},
  windows:[{limitId:'codex',slot:'secondary',planType,usedPercent:used,windowDurationMins:10080,resetsAt:Math.floor((at+7*1440*M)/1000)}]});

const historicalCapacity=(usd=100)=>({status:'available',computedAt:new Date(at).toISOString(),
  planScope:{planType:'plus'},accountAttribution:{status:'historical_unattributed',maySpanMultipleAccounts:true},
  selectedScenario:'unresolved_as_standard',scenarios:{unresolved_as_standard:{medianCapacityUsd:usd,
    cohortId:'1'.repeat(64),basisId:codexPrimaryAllowanceBasis('unresolved_as_standard').basisId}}});

async function capacityFixture(t,{switches=false}={}){
  const w=createWorkspace({files:1,events:1});t.after(()=>w.cleanup());
  const stateFile=join(w.state,'capacity-scope.sqlite'),indexFile=join(w.state,'capacity-index.sqlite');
  const file=w.receipt.sources[0],id=JSON.parse((await readFile(file,'utf8')).split('\n')[0]).payload.id;
  const line=(minute,type,payload)=>JSON.stringify({timestamp:new Date(at+minute*M).toISOString(),type,payload})+'\n';
  const usage=(minute,n)=>line(minute,'event_msg',{type:'token_count',info:{
    total_token_usage:{input_tokens:1000*n,cached_input_tokens:0,output_tokens:100*n,reasoning_output_tokens:0,total_tokens:1100*n},
    last_token_usage:{input_tokens:1000,cached_input_tokens:0,output_tokens:100,reasoning_output_tokens:0,total_tokens:1100}}});
  await writeFile(file,line(0,'session_meta',{id})+line(0,'turn_context',{model:'gpt-5.1-codex-max'})+
    usage(1,1)+usage(3.5,2)+usage(5.5,3));
  await refreshLocalIndex({codexHome:w.codexHome,indexFile,secretFile:w.secretFile,workerCount:1});
  const records=switches?[snapshot(0,scopes[0],10,'plus'),snapshot(2,scopes[0],12,'plus'),
    snapshot(3,scopes[1],80,'plus'),snapshot(4,scopes[1],85,'plus'),
    snapshot(5,scopes[0],47,'plus'),snapshot(6,scopes[0],49,'plus')]
    :[snapshot(0,scopes[0],43,'plus'),snapshot(6,scopes[0],49,'plus')];
  await commitLocalCollectorState({stateFile,checkpoint:{},records,clock:()=>at+6*M});
  const quotaEvidence=await readWorkloadQuotaEvidence({stateFile,fromMs:at,historyFromMs:at,nowMs:at+6*M});
  const options={indexFile,quotaEvidence,nowMs:at+6*M,liveSinceMs:at,timeZone:'UTC',accountScopeToken:token(scopes[0]),
    sourceFresh:true,quotaWindows:[{limitId:'codex',durationMinutes:10080,planType:'plus',usedPercent:49,
      resetAt:new Date(at+7*1440*M).toISOString(),observedAt:new Date(at+6*M).toISOString()}]};
  return {indexFile,stateFile,options,read:extra=>readLocalIndexWorkload({...options,capacity:historicalCapacity(),...extra})};
}

test('single-account capacity restores expected consumption without assigning historical usage or changing the Plus balance',async t=>{
  const f=await capacityFixture(t),before=await readFile(f.indexFile),value=f.read();
  assert.equal(value.allowance.remainingPercent,51);assert.equal(value.comparison.actualPp,6);
  assert.equal(value.comparison.capacityUsd,100);assert.ok(value.comparison.expectedPp>0);
  assert.equal(value.capacityHistory.length,1);
  const matched=f.read({capacity:{...historicalCapacity(),accountScopeToken:token(scopes[0])}});
  assert.deepEqual(value.comparison,matched.comparison);
  const larger=f.read({capacity:historicalCapacity(200)});
  assert.equal(larger.comparison.expectedPp,value.comparison.expectedPp/2);
  assert.deepEqual(await readFile(f.indexFile),before);
  const store=workloadStateStore(f.indexFile);await store.write(token(scopes[0]),workloadState(value));
  const restarted=f.read({storedState:await workloadStateStore(f.indexFile).read(token(scopes[0]))});
  assert.deepEqual(restarted.comparison,value.comparison);
  assert.deepEqual(restarted.capacityHistory,value.capacityHistory);
  const serialized=JSON.stringify(value);
  for(const scope of scopes){assert.ok(!serialized.includes(scope));assert.ok(!serialized.includes(token(scope)));}
  assert.doesNotMatch(serialized,/creator_account_id|creator_user_id|accountKey|scopeToken|scopeId/);
});

test('single-account capacity still refuses explicit foreign identity, missing provenance and a different plan',async t=>{
  const f=await capacityFixture(t),base=historicalCapacity();
  for(const capacity of [{...base,accountScopeToken:token(scopes[1])},{...base,accountScopeToken:null},
    {...base,accountAttribution:undefined},{...base,planScope:{planType:'pro'}},{...base,status:'unavailable'}]){
    const value=f.read({capacity});
    assert.equal(value.allowance.remainingPercent,51);assert.equal(value.comparison.actualPp,6);
    assert.equal(value.comparison.capacityUsd,null);assert.equal(value.comparison.expectedPp,null);
    assert.equal(value.capacityHistory.length,0);
  }
});

test('single-account capacity preserves A-B-A comparison boundaries and restart replay',async t=>{
  const f=await capacityFixture(t,{switches:true}),value=f.read();
  assert.equal(value.comparison.startedAtMs,at+5*M);assert.equal(value.comparison.actualPp,2);
  assert.ok(value.comparison.expectedPp>0);
  const all=await capacityFixture(t),whole=all.read();
  assert.ok(Math.abs(value.comparison.expectedPp*3-whole.comparison.expectedPp)<1e-12);
  const store=workloadStateStore(f.indexFile);await store.write(token(scopes[0]),workloadState(value));
  assert.deepEqual(f.read({storedState:await store.read(token(scopes[0]))}).comparison,value.comparison);
});

test('single-account capacity cannot convert missing usage coverage to expected zero',async t=>{
  const f=await capacityFixture(t),previous=f.read(),db=openLocalIndexStore(f.indexFile);
  try{db.prepare(`INSERT INTO integrity_gap(source_id,byte_start,byte_end,event_lower_ms,event_upper_ms,
    reason,confidence,created_at_ms,repair_status) SELECT id,0,size_bytes,NULL,NULL,
    'codex_rollout_lineage_invalid','bounded',?,'open' FROM source LIMIT 1`).run(at);}finally{db.close();}
  const value=f.read();
  assert.equal(value.comparison.capacityUsd,100);assert.equal(value.comparison.actualPp,6);
  assert.equal(value.comparison.expectedPp,null);assert.equal(value.comparison.coverage,'partial');
  assert.ok(value.errors.some(e=>e.code==='integrity_gap'));
  f.options.quotaEvidence.errorCode='quota_history_read_failed';
  const retained=f.read({previous,previousAccountScopeToken:f.options.accountScopeToken});
  assert.equal(retained.comparison.actualPp,6);assert.equal(retained.comparison.expectedPp,null);
});

test('a failed quota history read retains only the last confirmed dated same-account comparison',async t=>{
  const f=await capacityFixture(t),previous=f.read(),before=structuredClone(previous);
  const failed={errorCode:'quota_history_read_failed'};
  const read=(minute,last=previous)=>f.read({previous:last,previousAccountScopeToken:f.options.accountScopeToken,
    quotaEvidence:failed,nowMs:at+minute*M,
    quotaWindows:[{...f.options.quotaWindows[0],usedPercent:70,observedAt:new Date(at+minute*M).toISOString()}]});
  const retained=read(8);
  assert.equal(retained.status,'stale');
  assert.equal(retained.generatedAt,previous.generatedAt);
  assert.equal(retained.attemptedAt,new Date(at+8*M).toISOString());
  assert.deepEqual(retained.comparison,{...previous.comparison,coverage:'partial'});
  assert.equal(retained.allowance.remainingPercent,30);
  assert.ok(retained.errors.some(e=>e.code==='quota_history_read_failed'));
  const repeated=read(10,retained);
  assert.deepEqual(repeated.comparison,retained.comparison);
  assert.equal(repeated.generatedAt,previous.generatedAt);
  assert.deepEqual(previous,before);
  assert.doesNotMatch(JSON.stringify(retained),/accountKey|scopeToken|scopeId/);
});

test('a failed history read cannot bridge an unobserved A-B-A epoch and successful replay selects the new epoch',async t=>{
  const f=await capacityFixture(t),previous=f.read();
  await commitLocalCollectorState({stateFile:f.stateFile,checkpoint:{},clock:()=>at+9*M,
    records:[snapshot(7,scopes[1],80,'plus'),snapshot(8,scopes[0],60,'plus'),snapshot(9,scopes[0],62,'plus')]});
  const options={previous,previousAccountScopeToken:f.options.accountScopeToken,nowMs:at+9*M,
    quotaWindows:[{...f.options.quotaWindows[0],usedPercent:62,observedAt:new Date(at+9*M).toISOString()}]};
  const retained=f.read({...options,quotaEvidence:{errorCode:'quota_history_read_failed'}});
  assert.equal(retained.comparison.actualPp,6);
  assert.equal(retained.comparison.observedThrough,new Date(at+6*M).toISOString());
  assert.equal(retained.comparison.startedAtMs,at);
  const quotaEvidence=await readWorkloadQuotaEvidence({stateFile:f.stateFile,fromMs:at,historyFromMs:at,nowMs:at+9*M});
  const recovered=f.read({...options,previous:retained,quotaEvidence});
  assert.equal(recovered.comparison.startedAtMs,at+8*M);
  assert.equal(recovered.comparison.actualPp,2);
  assert.equal(recovered.comparison.observedThrough,new Date(at+9*M).toISOString());
});

test('failed history reads never inherit a comparison across account, unknown identity or plan changes',async t=>{
  const f=await capacityFixture(t),previous=f.read();
  for(const extra of [{previousAccountScopeToken:null},{accountScopeToken:token(scopes[1])},
    {accountScopeToken:null},{quotaWindows:[{...f.options.quotaWindows[0],planType:'pro'}]}]){
    const value=f.read({previous,previousAccountScopeToken:f.options.accountScopeToken,
      quotaEvidence:{errorCode:'quota_history_read_failed'},...extra});
    assert.equal(value.comparison.actualPp,null);
    assert.equal(value.comparison.expectedPp,null);
    assert.notEqual(value.status,'stale');
  }
});

for(const [name,lower,upper,expectedKnown] of [['unknown',null,null,false],['overlapping',at+2*M,at+3*M,false],
  ['after the confirmed comparison',at+7*M,at+8*M,true]])
test(`a failed history read preserves the usage-gap refusal for ${name} coverage`,async t=>{
  const f=await capacityFixture(t),previous=f.read(),db=openLocalIndexStore(f.indexFile);
  try{db.prepare(`INSERT INTO integrity_gap(source_id,byte_start,byte_end,event_lower_ms,event_upper_ms,
    reason,confidence,created_at_ms,repair_status) SELECT id,0,size_bytes,?,?,
    'codex_rollout_lineage_invalid',?,?,'open' FROM source LIMIT 1`).run(lower,upper,lower===null?'bounded':'exact',at);}
  finally{db.close();}
  const value=f.read({previous,previousAccountScopeToken:f.options.accountScopeToken,nowMs:at+8*M,
    quotaEvidence:{errorCode:'quota_history_read_failed'}});
  assert.equal(value.status,'stale');
  assert.equal(value.comparison.actualPp,previous.comparison.actualPp);
  assert.equal(value.comparison.expectedPp,expectedKnown?previous.comparison.expectedPp:null);
  assert.equal(value.comparison.observedThrough,previous.comparison.observedThrough);
  assert.ok(value.errors.some(e=>e.code==='integrity_gap'));
});

for(const [name,lower,upper,expectedKnown] of [['inside the old confirmed span',at+2*M,at+3*M,false],
  ['after the old confirmed span',at+7*M,at+8*M,true]])
test(`long-running failed history reads check exact gaps ${name} outside the display lookback`,async t=>{
  const f=await capacityFixture(t),previous=f.read(),db=openLocalIndexStore(f.indexFile);
  try{db.prepare(`INSERT INTO integrity_gap(source_id,byte_start,byte_end,event_lower_ms,event_upper_ms,
    reason,confidence,created_at_ms,repair_status) SELECT id,0,size_bytes,?,?,
    'codex_rollout_lineage_invalid','exact',?,'open' FROM source LIMIT 1`).run(lower,upper,at);}
  finally{db.close();}
  const nowMs=at+21*1440*M;
  const value=f.read({previous,previousAccountScopeToken:f.options.accountScopeToken,nowMs,
    quotaWindows:[{...f.options.quotaWindows[0],observedAt:new Date(nowMs).toISOString(),
      resetAt:new Date(nowMs+7*1440*M).toISOString()}],
    quotaEvidence:{errorCode:'quota_history_read_failed'}});
  assert.equal(value.status,'stale');
  assert.equal(value.comparison.startedAtMs,previous.comparison.startedAtMs);
  assert.equal(value.comparison.observedThrough,previous.comparison.observedThrough);
  assert.equal(value.comparison.actualPp,previous.comparison.actualPp);
  assert.equal(value.comparison.expectedPp,expectedKnown?previous.comparison.expectedPp:null);
  assert.equal(value.errors.some(e=>e.code==='integrity_gap'),!expectedKnown);
});

test('current/history connection isolates A-B-A epochs and keeps private handles out of DTOs',async()=>{
  const w=createWorkspace({files:1,events:1}),stateFile=join(w.state,'scope-history.sqlite'),indexFile=join(w.state,'scope-index.sqlite');
  try{
    await refreshLocalIndex({codexHome:w.codexHome,indexFile,secretFile:w.secretFile,workerCount:1});
    // An older A row is deliberately appended after the B row.
    const records=[snapshot(0,scopes[0],10),snapshot(2,scopes[1],80),snapshot(1,scopes[0],12),
      snapshot(3,scopes[1],85),snapshot(4,null,13),snapshot(5,scopes[0],14),snapshot(6,scopes[0],16)];
    await commitLocalCollectorState({stateFile,checkpoint:{},records,clock:()=>at+6*M});
    const quotaEvidence=await readWorkloadQuotaEvidence({stateFile,fromMs:at,historyFromMs:at,nowMs:at+6*M});
    const base={indexFile,quotaEvidence,nowMs:at+6*M,liveSinceMs:at,timeZone:'UTC',accountScopeToken:token(scopes[0]),
      quotaWindows:[{limitId:'codex',durationMinutes:10080,planType:'pro',usedPercent:16,
        resetAt:new Date(at+7*1440*M).toISOString(),observedAt:new Date(at+6*M).toISOString()}]};
    const value=readLocalIndexWorkload(base);
    assert.equal(value.allowance.remainingPercent,84,JSON.stringify(value.errors));
    assert.equal(value.segmentation.plans[0].observedPp,4);
    assert.equal(value.comparison.startedAtMs,at+5*M);
    assert.equal(value.comparison.actualPp,2);
    const serialized=JSON.stringify(value);
    for(const scope of scopes){assert.ok(!serialized.includes(scope));assert.ok(!serialized.includes(token(scope)));}
    assert.doesNotMatch(serialized,/accountKey|scopeToken|scopeId/);
    const unknown=readLocalIndexWorkload({...base,accountScopeToken:null,previous:value});
    assert.equal(unknown.allowance.remainingPercent,84);
    assert.equal(unknown.coverage.actualPp,0);
    assert.ok(unknown.workHours.every(x=>x.hours===null));
  }finally{w.cleanup();}
});

test('ordered same-time direct records remain attributable to their own accounts',async()=>{
  const w=createWorkspace({files:1,events:1}),stateFile=join(w.state,'conflict.sqlite'),indexFile=join(w.state,'conflict-index.sqlite');
  try{
    await refreshLocalIndex({codexHome:w.codexHome,indexFile,secretFile:w.secretFile,workerCount:1});
    await commitLocalCollectorState({stateFile,checkpoint:{},records:[snapshot(0,scopes[0],10),snapshot(0,scopes[1],10)],clock:()=>at});
    const quotaEvidence=await readWorkloadQuotaEvidence({stateFile,fromMs:at,nowMs:at});
    const value=readLocalIndexWorkload({indexFile,quotaEvidence,nowMs:at,liveSinceMs:at,accountScopeToken:token(scopes[0]),
      quotaWindows:[{limitId:'codex',durationMinutes:10080,planType:'pro',usedPercent:10,
        resetAt:new Date(at+7*1440*M).toISOString(),observedAt:new Date(at).toISOString()}]});
    assert.equal(value.allowance.remainingPercent,90);
    assert.ok(!value.errors.some(e=>e.code==='quota_observation_conflict'));
  }finally{w.cleanup();}
});

test('account-bound recovery stages replay after restart without duplicating consumed quota',async()=>{
  const w=createWorkspace({files:1,events:1}),stateFile=join(w.state,'recovery.sqlite'),indexFile=join(w.state,'recovery-index.sqlite');
  try{
    await refreshLocalIndex({codexHome:w.codexHome,indexFile,secretFile:w.secretFile,workerCount:1});
    const records=[snapshot(0,scopes[0],30),snapshot(1,scopes[0],36),snapshot(2,scopes[0],21),snapshot(3,scopes[0],30)];
    await commitLocalCollectorState({stateFile,checkpoint:{},records,clock:()=>at+3*M});
    const options={indexFile,nowMs:at+3*M,liveSinceMs:at,timeZone:'UTC',accountScopeToken:token(scopes[0])};
    const read=async extra=>readLocalIndexWorkload({...options,...extra,
      quotaEvidence:await readWorkloadQuotaEvidence({stateFile,fromMs:at,nowMs:at+3*M})});
    const value=await read({});
    assert.equal(value.allowance.remainingPercent,70);
    assert.equal(value.segmentation.plans[0].observedPp,15);
    assert.equal(value.comparison.actualPp,15);
    const store=workloadStateStore(indexFile);
    await store.write(token(scopes[0]),workloadState(value));
    await commitLocalCollectorState({stateFile,checkpoint:{},records,clock:()=>at+3*M});
    const restarted=await read({storedState:await workloadStateStore(indexFile).read(token(scopes[0]))});
    assert.deepEqual(restarted.comparison,value.comparison);
    assert.deepEqual(restarted.segmentation,value.segmentation);
    assert.doesNotMatch(JSON.stringify(restarted),/observationOrder|recordOrder|scopeToken|scopeId|accountKey/);
  }finally{w.cleanup();}
});

test('same-millisecond A-B-A comparison uses only the final epoch and ignores the old saved baseline',async()=>{
  const w=createWorkspace({files:1,events:1}),stateFile=join(w.state,'tied-epochs.sqlite'),indexFile=join(w.state,'tied-epochs-index.sqlite');
  try{
    await refreshLocalIndex({codexHome:w.codexHome,indexFile,secretFile:w.secretFile,workerCount:1});
    const records=[snapshot(0,scopes[0],10),snapshot(0,scopes[0],12),snapshot(0,scopes[1],80),
      snapshot(0,scopes[0],20),snapshot(0,scopes[0],23)];
    await commitLocalCollectorState({stateFile,checkpoint:{},records,clock:()=>at});
    const quotaEvidence=await readWorkloadQuotaEvidence({stateFile,fromMs:at,nowMs:at});
    const value=readLocalIndexWorkload({indexFile,quotaEvidence,nowMs:at,liveSinceMs:at,accountScopeToken:token(scopes[0]),
      storedState:{schemaVersion:'overview-workload-state-v3',comparison:{startedAtMs:at,capacityUsd:999,planType:'pro',
        baseline:{atMs:at,usedPercent:10,resetAtMs:at+7*1440*M,planType:'pro',limitId:'codex'}},capacityHistory:[]}});
    assert.equal(value.segmentation.plans[0].observedPp,5);
    assert.equal(value.comparison.actualPp,3);
    assert.equal(value.comparison.baseline.usedPercent,20);
    assert.equal(value.comparison.capacityUsd,null);
  }finally{w.cleanup();}
});
