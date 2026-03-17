import React from 'react';
import { Composition } from 'remotion';
import { FPS, CANVAS } from './lib/brand';

// Compositions
import { ProductExplainer } from './compositions/ProductExplainer';
import { GapAnalysis } from './compositions/FeatureSpotlight/GapAnalysis';
import { VendorQuestionnaires } from './compositions/FeatureSpotlight/VendorQuestionnaires';
import { DoraCopilot } from './compositions/FeatureSpotlight/DoraCopilot';
import { MonitoringAlerts } from './compositions/FeatureSpotlight/MonitoringAlerts';
import { RegisterOfInfo } from './compositions/FeatureSpotlight/RegisterOfInfo';
import { EnterpriseSecurity } from './compositions/FeatureSpotlight/EnterpriseSecurity';
import { SocialCut } from './compositions/SocialCut';
import { DemoOverlay } from './compositions/DemoOverlay';

export function RemotionRoot() {
  return (
    <>
      {/* Product Explainer — 81s @ 30fps */}
      <Composition
        id="ProductExplainer"
        component={ProductExplainer}
        durationInFrames={2430}
        fps={FPS}
        width={CANVAS.wide.width}
        height={CANVAS.wide.height}
      />

      {/* Feature Spotlights — 25s each */}
      <Composition
        id="FeatureSpotlight-GapAnalysis"
        component={GapAnalysis}
        durationInFrames={750}
        fps={FPS}
        width={CANVAS.wide.width}
        height={CANVAS.wide.height}
      />
      <Composition
        id="FeatureSpotlight-VendorQuestionnaires"
        component={VendorQuestionnaires}
        durationInFrames={750}
        fps={FPS}
        width={CANVAS.wide.width}
        height={CANVAS.wide.height}
      />
      <Composition
        id="FeatureSpotlight-DoraCopilot"
        component={DoraCopilot}
        durationInFrames={750}
        fps={FPS}
        width={CANVAS.wide.width}
        height={CANVAS.wide.height}
      />
      <Composition
        id="FeatureSpotlight-MonitoringAlerts"
        component={MonitoringAlerts}
        durationInFrames={750}
        fps={FPS}
        width={CANVAS.wide.width}
        height={CANVAS.wide.height}
      />
      <Composition
        id="FeatureSpotlight-RegisterOfInfo"
        component={RegisterOfInfo}
        durationInFrames={750}
        fps={FPS}
        width={CANVAS.wide.width}
        height={CANVAS.wide.height}
      />
      <Composition
        id="FeatureSpotlight-EnterpriseSecurity"
        component={EnterpriseSecurity}
        durationInFrames={750}
        fps={FPS}
        width={CANVAS.wide.width}
        height={CANVAS.wide.height}
      />

      {/* Social Cut — 15s, 9:16 portrait */}
      <Composition
        id="SocialCut"
        component={SocialCut}
        durationInFrames={450}
        fps={FPS}
        width={CANVAS.portrait.width}
        height={CANVAS.portrait.height}
      />

      {/* Demo Overlay — 30s, transparent WebM */}
      <Composition
        id="DemoOverlay"
        component={DemoOverlay}
        durationInFrames={900}
        fps={FPS}
        width={CANVAS.wide.width}
        height={CANVAS.wide.height}
      />
    </>
  );
}
