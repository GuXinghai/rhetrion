import {
  createRefreshPollingBudget,
  historyIndexContinuationDecision,
  refreshAccountingStatus,
  refreshNeedsContinuation,
} from "./lib.js";
import { createElectronRefreshLease } from "./electron-refresh-lifecycle.js";

const REINDEX_AUTO_CONTINUE_LIMIT = 40;
const REINDEX_AUTO_CONTINUE_DELAY_MS = 1_500;

/** Owns one renderer's refresh submission and publication observation.
 * Durable work and business scheduling remain owned by the companion.
 * View ports present evidence; they do not store coordinator state.
 */
export function createRefreshCoordinator({
  client, events, view, desktop, lifecycle,
  pollingBudgetFactory = createRefreshPollingBudget,
  leaseFactory = createElectronRefreshLease,
  setTimeoutRef = globalThis.setTimeout,
  clearTimeoutRef = globalThis.clearTimeout,
}) {
  let reindexAutoContinuations = 0;
  let reindexAutoContinueTimer = null;
  let lastReindexProgressReceipt = null;
  let localRefreshInProgress = false;
  let localRefreshSubmissionPending = false;
  let localRefreshObserverActive = false;
  let localRefreshStatusVersion = 0;
  let overviewPublicationPollingStarted = false;
  let lastObservedRefreshPublication = null;
  let lastOverviewScheduleError = null;
  let localRefreshCancelRequested = false;
  let localRefreshObservationWait = null;

  /**
   * True when the local history index has discovered more sources than it has
   * indexed — a one-time build or a parser-version reparse is still catching up.
   * Reads the same coverage the top-bar badge uses; demo mode is never pending.
   */
  function historyIndexIncomplete() {
    if (!view.context().dashboard || view.context().dashboard.mode === "demo") return false;
    return currentHistoryContinuationDecision().incomplete;
  }

  function currentHistoryContinuationDecision() {
    const history = view.context().dashboard?.pricing?.historyCoverage
      ?? view.context().dashboard?.accounting?.historyCoverage
      ?? null;
    return historyIndexContinuationDecision({
      history,
      generation: view.context().dashboard?.accounting?.generation ?? null,
      generationFingerprint:
        view.context().dashboard?.accounting?.generationFingerprint ?? null,
      previousReceipt: lastReindexProgressReceipt,
    });
  }

  function historyProgressReceipt() {
    return currentHistoryContinuationDecision().receipt;
  }

  /**
   * After an explicit detailed refresh that left the history index incomplete, run the
   * next pass promptly instead of waiting for the sparse auto-cadence, bounded
   * by REINDEX_AUTO_CONTINUE_LIMIT. Stops the moment coverage completes, the
   * user interacts, or the bound is reached (the ordinary cadence then carries
   * the remainder). Never runs in demo mode or while another action is busy.
   */
  function scheduleReindexAutoContinuation() {
    if (reindexAutoContinueTimer !== null) {
      clearTimeoutRef(reindexAutoContinueTimer);
      reindexAutoContinueTimer = null;
    }
    const decision = currentHistoryContinuationDecision();
    if (!decision.incomplete) {
      reindexAutoContinuations = 0;
      lastReindexProgressReceipt = null;
      return;
    }
    if (!decision.shouldContinue) return;
    lastReindexProgressReceipt = decision.receipt;
    if (reindexAutoContinuations >= REINDEX_AUTO_CONTINUE_LIMIT) return;
    reindexAutoContinueTimer = setTimeoutRef(() => {
      reindexAutoContinueTimer = null;
      if (view.isBusy() || !historyIndexIncomplete()) {
        reindexAutoContinuations = 0;
        return;
      }
      reindexAutoContinuations += 1;
      void requestRefresh({ autoContinue: true, detailed: true });
    }, REINDEX_AUTO_CONTINUE_DELAY_MS);
  }

  async function requestRefresh({ autoContinue = false, detailed = false, observeOnly = false, initialRefresh = null } = {}) {
    if (!observeOnly && !view.canSubmit()) return;
    if (view.isBusy() || localRefreshObserverActive || localRefreshSubmissionPending) return;
    const previousGlobalState = view.context().globalState;
    // Fence continuation against the exact coverage visible before this pass.
    // If the terminal reload presents the same generation/count/byte receipt,
    // scheduleReindexAutoContinuation stops immediately instead of spending the
    // rest of its 40-pass budget on identical work.
    lastReindexProgressReceipt = historyProgressReceipt();
    // A person pressing Refresh restarts the auto-continuation budget; a chained
    // reindex pass keeps counting toward the bound set when it began.
    if (!autoContinue) reindexAutoContinuations = 0;
    if (!view.analysisAllowed()) {
      view.notice({
        titleKey: "refresh.preflightTitle",
        copyKey: "refresh.preflightCopy",
        kind: "warning",
        showCheck: true,
        showDemo: !view.context().dashboard,
      });
      view.actions();
      return;
    }
    const electronRefresh = desktop.enabled();
    let refreshAccepted = observeOnly;
    let cancelled = false;
    let quickResultLoaded = false;
    let continuationLimitReached = false;
    let refreshLeaseSession = null;
    let refreshProgressClock = null;
    let sidebarResultKey = "refresh.sidebar.failed";
    let refreshSucceeded = false;
    let observationInterrupted = false;
    let observationExpired = false;
    let observedRefreshId = null;
    let eventCursor = events.cursor();
    localRefreshStatusVersion += 1;
    localRefreshObserverActive = true;
    view.setBusy(true);
    localRefreshSubmissionPending = !observeOnly;
    localRefreshInProgress = observeOnly;
    localRefreshCancelRequested = false;
    if (observeOnly) view.progress("Update running…");
    else view.submitting();
    view.actions();
    if (observeOnly) view.setGlobalState("updating");
    try {
      const accepted = observeOnly ? null : await (detailed
        ? client.recalculateDetailedAccounting()
        : client.refresh());
      initialRefresh = accepted?.refresh ?? initialRefresh;
      refreshAccepted = true;
      localRefreshSubmissionPending = false;
      localRefreshInProgress = true;
      view.setGlobalState("updating");
      if (electronRefresh && !observeOnly) {
        refreshLeaseSession = leaseFactory({
          bridge: desktop.bridge(),
          // Both ordinary overview and explicit detailed requests can calculate
          // usage. Only an actually quota-only run receives quick lease bounds.
          mode: initialRefresh?.mode === "quick" && accepted?.request?.pending !== true ? "quick" : "detailed",
          onState(next) {
            desktop.onState(next);
            if (!localRefreshInProgress) void desktop.refreshHealth();
          },
        });
        // Connection bookkeeping must never delay companion polling. A bounded late
        // start reply is still settled by the lifecycle module after completion.
        void refreshLeaseSession.start();
      }
      refreshProgressClock = view.startProgress(detailed
        ? "Starting detailed accounting…"
        : "Starting local analysis…");
      const pollingBudget = pollingBudgetFactory();
      let outcome = "running";
      let finalErrorCode = null;
      let finalFailedStep = null;
      let finalFailureCode = null;
      let finalRefreshState = null;
      let timeoutSettlementNoted = false;
      while (pollingBudget.hasTime()
          && ["running", "cancelling"].includes(outcome)) {
        if (!initialRefresh) {
          if (["unavailable", "closed"].includes(events.connection())) {
            observationInterrupted = true;
            throw new Error("Refresh observation unavailable.");
          }
          const remaining = pollingBudget.remainingMs();
          if (remaining <= 0) break;
          const waitController = new AbortController();
          localRefreshObservationWait = waitController;
          try {
            await events.wait(eventCursor, { signal: waitController.signal, timeoutMs: remaining });
          } finally {
            if (localRefreshObservationWait === waitController) localRefreshObservationWait = null;
          }
          if (!pollingBudget.hasTime()) break;
          const nextCursor = events.cursor();
          if (waitController.signal.aborted && nextCursor === eventCursor) continue;
          eventCursor = nextCursor;
          if (events.connection() !== "connected") {
            refreshProgressClock.update("Update running; reconnecting…");
            continue;
          }
        }
        let status;
        try {
          status = initialRefresh ? { refresh: initialRefresh } : await client.refreshStatus();
          initialRefresh = null;
        } catch (error) {
          refreshProgressClock.update("Update running; reconnecting…");
          observationInterrupted = true;
          throw error;
        }
        const refresh = status?.refresh ?? {};
        if (refresh.refreshId && refresh.refreshId !== observedRefreshId) {
          observedRefreshId = refresh.refreshId;
          quickResultLoaded = false;
        }
        if (refresh.status === "cancelling") localRefreshCancelRequested = true;
        finalRefreshState = refresh;
        outcome = refresh.status ?? "failed";
        finalErrorCode = refresh.errorCode ?? null;
        finalFailedStep = refresh.failedStep ?? finalFailedStep;
        finalFailureCode = refresh.failureCode ?? finalFailureCode;
        const progress = refresh.progress ?? refresh.result?.indexing ?? null;
        const collectorProgress = progress?.kind === undefined;
        const unifiedIndexScanning = progress?.kind === "unified_index"
          && progress?.status === "scanning"
          && progress?.phase === "rollout_index";
        if ((refresh.quickResultAt || (collectorProgress && progress?.phase === "quick_result"))
            && !quickResultLoaded) {
          try {
            await view.quickReload();
            quickResultLoaded = true;
          } catch {
            // Keep polling. The verified quick snapshot can still be loaded when
            // deep accounting finishes, and no partial replacement is invented.
          }
        }
        const accountingStatus = outcome === "running"
          ? refreshAccountingStatus({ progress })
          : null;
        const countedProgress = collectorProgress || unifiedIndexScanning;
        const processed = countedProgress
            && Number.isSafeInteger(progress?.filesProcessed)
          ? progress.filesProcessed : null;
        const selected = countedProgress
            && Number.isSafeInteger(progress?.filesSelected)
          ? progress.filesSelected : null;
        const phase = outcome === "cancelling"
          ? "Stopping safely…"
          : refresh.quota?.status === "running"
            ? "Reading allowance…"
          : accountingStatus !== null ? "Starting detailed accounting…"
          : refresh.usage?.status === "running" ? "Allowance updated; calculating usage…"
          : "Starting local analysis…";
        refreshProgressClock.update(phase, { processed, selected });
        view.actions();
        if (detailed && refresh.mode === "detailed" && refresh.running === false && refreshNeedsContinuation({
          outcome,
          errorCode: refresh.errorCode,
          progress,
        })) {
          if (!pollingBudget.canContinue()) {
            continuationLimitReached = true;
            throw new Error("The bounded continuation limit was reached.");
          }
          try {
            const continuation = await (detailed
              ? client.recalculateDetailedAccounting()
              : client.refresh());
            initialRefresh = continuation?.refresh ?? null;
            if (continuation?.request?.started === true) {
              pollingBudget.noteContinuation();
              timeoutSettlementNoted = false;
              refreshProgressClock.reset("Continuing local analysis…");
            }
          } catch (error) {
            // A 409 means a timed-out pass is still finishing its durable
            // checkpoint. Keep polling until it becomes resumable.
            if (error?.status !== 409) throw error;
            if (!timeoutSettlementNoted) {
              pollingBudget.noteSettling();
              timeoutSettlementNoted = true;
            }
          }
          outcome = "running";
          continue;
        }
        if (detailed && outcome === "failed"
            && refresh.errorCode === "refresh_timed_out" && refresh.running === true) {
          refreshProgressClock.update("Stopping timed-out analysis…");
          if (!timeoutSettlementNoted) {
            pollingBudget.noteSettling();
            timeoutSettlementNoted = true;
          }
          outcome = "running";
        }
        // A failed timeout receipt can still own a settling writer. Observe it
        // until the controller releases ownership before presenting completion.
        if (refresh.running === true && !["running", "cancelling"].includes(outcome)) outcome = "running";
        // A joined quota-only run is not completion of an accepted usage/detail
        // request. Keep one observer across the controller's bounded follow-up.
        if (refresh.pending !== null && typeof refresh.pending === "object"
            && !["running", "cancelling"].includes(outcome)) outcome = "running";
        if (!["running", "cancelling"].includes(outcome)) {
          const published = events.current()?.refresh;
          if (events.connection() !== "connected" || !published
              || published.refreshId !== refresh.refreshId || published.publication === "running"
              || ["running", "cancelling"].includes(published.status) || published.pending) outcome = "running";
        }
      }
      if (["running", "cancelling"].includes(outcome)) {
        observationInterrupted = true;
        observationExpired = true;
        throw new Error("Refresh observation needs reconnection.");
      }
      if (finalRefreshState?.finishedAt) {
        lastObservedRefreshPublication = `${finalRefreshState.refreshId ?? ""}:${finalRefreshState.quickResultAt ?? ""}:${finalRefreshState.finishedAt}`;
      }
      cancelled = outcome === "cancelled";
      if (!cancelled
          && finalRefreshState?.result?.accounting?.repair?.status === "unavailable") {
        view.notice({
          titleKey: "dashboard.recalculate.failedTitle",
          copyKey: "dashboard.recalculate.failedCopy",
          kind: "error",
          showCheck: true,
        });
      }
      if (cancelled) {
        sidebarResultKey = "refresh.sidebar.cancelled";
        refreshProgressClock.stop();
        refreshProgressClock = null;
        view.progress("Loading saved results…");
        await view.reload();
        return;
      }
      if (outcome === "failed"
          && finalErrorCode === "refresh_resource_limited") {
        sidebarResultKey = "refresh.resourceTitle";
        refreshProgressClock.stop();
        refreshProgressClock = null;
        view.progress("Loading saved results…");
        await view.reload();
        view.notice({
          titleKey: "refresh.resourceTitle",
          copyKey: "refresh.resourceCopy",
          kind: "warning",
        });
        return;
      }
      if (outcome === "degraded") {
        sidebarResultKey = "refresh.sidebar.partial";
        refreshProgressClock.stop();
        refreshProgressClock = null;
        view.progress(view.translate("refresh.degradedLoading"));
        if (await view.reload() === false) return;
        lastReindexProgressReceipt = historyProgressReceipt();
        view.publishResult(finalRefreshState);
        return;
      }
      if (outcome !== "succeeded") {
        // The companion stamps failures with a fixed step name and a bounded
        // machine code; carrying them here is the difference between "it did
        // not finish" and something a person can act on.
        const failureDetail = [finalFailedStep, finalFailureCode]
          .filter(Boolean).join(" · ");
        const failure = new Error(failureDetail
          ? `The local refresh failed at: ${failureDetail}.`
          : "The local refresh did not complete successfully.");
        if (finalFailureCode) failure.code = finalFailureCode;
        failure.refreshFailureDetail = failureDetail || null;
        throw failure;
      }
      refreshProgressClock.stop();
      refreshProgressClock = null;
      view.progress("Loading updated evidence…");
      if (await view.reload() === false) return;
      view.publishResult(finalRefreshState);
      refreshSucceeded = true;
      if (detailed && !observeOnly) scheduleReindexAutoContinuation();
    } catch (error) {
      if (observationInterrupted) {
        sidebarResultKey = observationExpired ? "refresh.stage.observationStopped" : "refresh.stage.reconnecting";
        return;
      }
      if (view.context().dashboard) {
        const presentation = view.presentation(view.context().dashboard);
        view.setGlobalState(presentation.state, {
          companionReachable: view.context().dashboard.mode !== "demo",
        });
      }
      if (!refreshAccepted && error?.status === 409) {
        sidebarResultKey = "refresh.alreadyRunningTitle";
        // Another surface owns the shared controller. In particular, a quick
        // run is not proof that this request's detailed work was accepted. Do
        // not enqueue an escalation or turn a safe conflict into a failure.
        view.notice({
          titleKey: "refresh.alreadyRunningTitle",
          copyKey: "refresh.alreadyRunningCopy",
          kind: "info",
        });
        return;
      }
      const described = await view.describeFailure({
        surface: "local_refresh",
        error,
        fallback: continuationLimitReached
          ? view.translate("refresh.continuationCopy")
          : refreshAccepted
            ? (error?.refreshFailureDetail
              ? view.translate("refresh.failedDetailCopy", { detail: error.refreshFailureDetail })
              : view.translate("refresh.failedCopy"))
          : view.translate("refresh.notStartedCopy"),
      });
      view.notice({
        title: continuationLimitReached
          ? view.translate("refresh.continuationTitle")
          : refreshAccepted
            ? view.translate("refresh.failedTitle")
          : view.translate("refresh.notStartedTitle"),
        copy: described.text,
        kind: continuationLimitReached ? "warning" : "error",
        showDemo: !view.context().dashboard
      });
    } finally {
      refreshProgressClock?.stop();
      if (electronRefresh && refreshAccepted) await refreshLeaseSession?.finish();
      view.setBusy(false);
      localRefreshSubmissionPending = false;
      localRefreshObserverActive = false;
      localRefreshInProgress = observationInterrupted;
      localRefreshCancelRequested = false;
      view.afterSettlement();
      view.actions();
      void desktop.refreshHealth();
      view.summary(refreshSucceeded ? "refresh.stage.complete" : sidebarResultKey, { success: refreshSucceeded });
      // Restore verified evidence freshness after settlement. A disconnected
      // observer retains the last confirmed busy state until it can read again.
      const currentDashboardState = view.context().dashboard
        ? view.presentation(view.context().dashboard).state
        : null;
      const stableState = [currentDashboardState, view.context().globalState?.state, previousGlobalState?.state]
        .find((state) => state && state !== "updating");
      const candidateState = view.context().dashboardReadFailed ? "stale" : stableState ?? "insufficient";
      view.setGlobalState(
        candidateState,
        {
          companionReachable: view.context().dashboard
            ? view.context().dashboard.mode !== "demo"
            : previousGlobalState?.companionReachable ?? false,
        },
      );
    }
  }

  async function cancelLocalAnalysis() {
    if (!localRefreshInProgress || localRefreshCancelRequested) return;
    localRefreshCancelRequested = true;
    localRefreshObservationWait?.abort();
    view.actions();
    try {
      await client.cancelRefresh();
      view.notice({
        titleKey: "refresh.cancelRequestedTitle",
        copyKey: "refresh.cancelRequestedCopy",
        kind: "info",
      });
    } catch {
      localRefreshCancelRequested = false;
      view.notice({
        titleKey: "refresh.cancelUnavailableTitle",
        copyKey: "refresh.cancelUnavailableCopy",
        kind: "warning",
        showCheck: true,
      });
    }
    view.actions();
  }


  let overviewPublicationReadPending = false;

  async function observeOverviewPublication() {
    if (events.current()?.refresh?.publication === "running") return;
    if (overviewPublicationReadPending || localRefreshObserverActive
        || localRefreshSubmissionPending || view.isBusy()
        || view.context().dashboard?.mode === "demo" || !view.analysisAllowed()) return;
    overviewPublicationReadPending = true;
    const eventCursor = events.cursor();
    const statusVersion = localRefreshStatusVersion;
    try {
      const status = await client.refreshStatus();
      if (statusVersion !== localRefreshStatusVersion) return;
      view.statusObserved(status?.refresh);
      const scheduleError = typeof status?.overviewSchedule?.errorCode === "string"
        ? status.overviewSchedule.errorCode : null;
      const previousScheduleError = lastOverviewScheduleError;
      lastOverviewScheduleError = scheduleError;
      if (scheduleError && scheduleError !== previousScheduleError) {
        view.notice({ titleKey: "refresh.schedule.failedTitle", copyKey: "refresh.schedule.failedCopy", kind: "warning" });
      }
      const refresh = status?.refresh;
      if (refresh?.running || ["running", "cancelling"].includes(refresh?.status)) {
        await requestRefresh({ observeOnly: true, initialRefresh: refresh });
        return;
      }
      localRefreshInProgress = false;
      localRefreshCancelRequested = false;
      view.actions();
      if (previousScheduleError && !scheduleError) view.summary(null);
      const receipt = refresh?.finishedAt
        ? `${refresh.refreshId ?? ""}:${refresh.quickResultAt ?? ""}:${refresh.finishedAt}` : null;
      if (receipt && receipt !== lastObservedRefreshPublication) {
        lastObservedRefreshPublication = receipt;
        if (await view.reload() !== false) {
          if (["failed", "cancelled"].includes(refresh.status)) {
            view.summary(refresh.status === "cancelled" ? "refresh.sidebar.cancelled" : "refresh.sidebar.failed");
            if (refresh.status === "failed") view.notice({ titleKey: "refresh.failedTitle", copyKey: "refresh.failedCopy", kind: "error" });
          } else {
            view.summary(refresh.status === "degraded" ? "refresh.sidebar.partial" : "refresh.stage.complete", { success: refresh.status === "succeeded" });
            view.publishResult(refresh);
          }
        }
      }
      if (scheduleError) view.summary("refresh.schedule.failedTitle");
    } catch {
      // A transport read cannot establish that the controller's work failed.
      if (localRefreshInProgress) view.summary("refresh.stage.reconnecting");
    } finally {
      overviewPublicationReadPending = false;
      if (events.cursor() !== eventCursor && events.connection() === "connected")
        void observeOverviewPublication();
    }
  }

  function startOverviewPublicationPolling() {
    if (overviewPublicationPollingStarted) return;
    overviewPublicationPollingStarted = true;
    events.subscribe(event => {
      if (event.connection !== "connected") {
        if (localRefreshInProgress) view.summary("refresh.stage.reconnecting");
        return;
      }
      void observeOverviewPublication();
    });
    const resume = () => {
      if (lifecycle.documentRef.visibilityState === "hidden") return;
      view.foreground();
    };
    lifecycle.documentRef.addEventListener("visibilitychange", resume);
    lifecycle.windowRef.addEventListener("focus", resume);
    lifecycle.windowRef.addEventListener("pagehide", event => { if (!event.persisted) events.close(); });
  }

  function stopContinuation() {
    if (reindexAutoContinueTimer !== null) clearTimeoutRef(reindexAutoContinueTimer);
    reindexAutoContinueTimer = null;
  }

  function state() {
    return Object.freeze({
      running: localRefreshInProgress,
      submitting: localRefreshSubmissionPending,
      observing: localRefreshObserverActive,
      cancelling: localRefreshCancelRequested,
      version: localRefreshStatusVersion,
      lastPublication: lastObservedRefreshPublication,
      scheduleError: lastOverviewScheduleError,
      waiting: localRefreshObservationWait !== null,
      continuationPending: reindexAutoContinueTimer !== null,
      continuations: reindexAutoContinuations,
    });
  }

  return Object.freeze({
    state, requestRefresh, cancelLocalAnalysis, observeOverviewPublication,
    start: startOverviewPublicationPolling, stopContinuation,
  });
}
