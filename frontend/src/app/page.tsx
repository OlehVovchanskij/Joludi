"use client";

import { riskLevelLabel } from "@/entities/telemetry/lib/analysis";
import { API_BASE } from "@/shared/config/api";
import { useDashboardState } from "@/widgets/dashboard/model/use-dashboard-state";
import { DashboardAiChatSection } from "@/widgets/dashboard/ui/DashboardAiChatSection";
import { DashboardAiSummarySection } from "@/widgets/dashboard/ui/DashboardAiSummarySection";
import { DashboardEasterEgg } from "@/widgets/dashboard/ui/DashboardEasterEgg";
import { DashboardHero } from "@/widgets/dashboard/ui/DashboardHero";
import { DashboardLoadingSection } from "@/widgets/dashboard/ui/DashboardLoadingSection";
import { DashboardMetricsSection } from "@/widgets/dashboard/ui/DashboardMetricsSection";
import { DashboardTrackSection } from "@/widgets/dashboard/ui/DashboardTrackSection";
import { DashboardUploadSection } from "@/widgets/dashboard/ui/DashboardUploadSection";

const sectionAnimation = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
};

export default function Home() {
  const dashboard = useDashboardState();

  return (
    <main className="relative mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-6 px-4 py-8 md:px-8 lg:py-10">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-40 bg-[radial-gradient(60%_90%_at_50%_10%,rgba(11,93,87,0.22),transparent)]" />
      <div className="pointer-events-none absolute left-0 top-24 -z-10 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(208,138,75,0.18),transparent_65%)] blur-2xl" />
      <div className="pointer-events-none absolute right-0 top-56 -z-10 h-80 w-80 rounded-full bg-[radial-gradient(circle,rgba(11,93,87,0.14),transparent_65%)] blur-2xl" />

      <DashboardHero
        sectionAnimation={sectionAnimation}
        isAuthorized={dashboard.isAuthorized}
        logoutLoading={dashboard.logoutLoading}
        onLogout={dashboard.handleLogout}
        onSecretTap={dashboard.handleSecretTap}
        heroHighlights={dashboard.heroHighlights}
        statusPills={dashboard.statusPills}
        apiBase={API_BASE}
        overviewCards={dashboard.overviewCards}
        snapshotCards={dashboard.snapshotCards}
      />

      <DashboardUploadSection
        sectionAnimation={sectionAnimation}
        file={dashboard.file}
        loading={dashboard.loading}
        error={dashboard.error}
        isDragging={dashboard.isDragging}
        checklistItems={dashboard.checklistItems}
        onSubmit={dashboard.submitLog}
        onSetDragging={dashboard.setIsDragging}
        onSetDroppedFile={dashboard.setDroppedFile}
        onClearFile={dashboard.clearSelectedFile}
      />

      {dashboard.loading && <DashboardLoadingSection />}

      <DashboardMetricsSection
        sectionAnimation={sectionAnimation}
        metricCards={dashboard.metricCards}
      />

      <DashboardAiSummarySection
        sectionAnimation={sectionAnimation}
        summaryProvider={dashboard.summary?.provider}
        summaryText={dashboard.summary?.summary}
        pilotRiskLabel={riskLevelLabel(dashboard.pilotRiskLevel)}
        pilotRecommendations={dashboard.pilotRecommendations}
        telemetryOk={dashboard.telemetryOk}
        hasTrajectory={dashboard.hasTrajectory}
        analysisReady={dashboard.analysisReady}
        insightCards={dashboard.insightCards}
      />

      <DashboardAiChatSection
        sectionAnimation={sectionAnimation}
        summaryProvider={dashboard.summary?.provider}
        hasResult={Boolean(dashboard.result)}
        chatMessages={dashboard.chatMessages}
        chatInput={dashboard.chatInput}
        chatLoading={dashboard.chatLoading}
        onSubmit={dashboard.sendChatMessage}
        onChangeInput={dashboard.setChatInput}
      />

      <DashboardTrackSection
        sectionAnimation={sectionAnimation}
        activeView={dashboard.activeView}
        trajectoryTimelineLength={dashboard.trajectoryTimeline.length}
        timeRange={dashboard.timeRange}
        elapsedTime={dashboard.elapsedTime}
        playbackDuration={dashboard.playbackDuration}
        playbackSpeed={dashboard.playbackSpeed}
        isPlaying={dashboard.isPlaying}
        mapPoints={dashboard.mapPoints}
        activeIndex={dashboard.activeIndex}
        mapMeta={dashboard.mapMeta}
        plotlyFigure={dashboard.result?.plotly_figure ?? null}
        activePoint3D={dashboard.getActivePoint3D()}
        telemetryCards={dashboard.telemetryCards}
        onChangeView={dashboard.setActiveView}
        onTogglePlay={() => dashboard.setIsPlaying(!dashboard.isPlaying)}
        onResetTimeline={dashboard.resetTimeline}
        onChangeTimeline={dashboard.updateTimelineByElapsed}
        onChangePlaybackSpeed={dashboard.setPlaybackSpeed}
      />

      <DashboardEasterEgg
        show={dashboard.showEasterEgg}
        onClose={() => dashboard.setShowEasterEgg(false)}
      />
    </main>
  );
}
