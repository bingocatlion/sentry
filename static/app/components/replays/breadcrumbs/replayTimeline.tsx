import {useRef} from 'react';
import styled from '@emotion/styled';

import Panel from 'sentry/components/panels/panel';
import Placeholder from 'sentry/components/placeholder';
import {
  MajorGridlines,
  MinorGridlines,
} from 'sentry/components/replays/breadcrumbs/gridlines';
import ReplayTimelineEvents from 'sentry/components/replays/breadcrumbs/replayTimelineEvents';
import Stacked from 'sentry/components/replays/breadcrumbs/stacked';
import TimelineGaps from 'sentry/components/replays/breadcrumbs/timelineGaps';
import {TimelineScrubber} from 'sentry/components/replays/player/scrubber';
import {useTimelineScrubberMouseTracking} from 'sentry/components/replays/player/useScrubberMouseTracking';
import {useReplayContext} from 'sentry/components/replays/replayContext';
import divide from 'sentry/utils/number/divide';
import toPercent from 'sentry/utils/number/toPercent';
import useTimelineScale from 'sentry/utils/replays/hooks/useTimelineScale';
import {useReplayReader} from 'sentry/utils/replays/playback/providers/replayReaderProvider';
import {useDimensions} from 'sentry/utils/useDimensions';

export default function ReplayTimeline() {
  const replay = useReplayReader();
  const {currentTime} = useReplayContext();
  const [timelineScale] = useTimelineScale();

  const panelRef = useRef<HTMLDivElement>(null);
  const mouseTrackingProps = useTimelineScrubberMouseTracking(
    {elem: panelRef},
    timelineScale
  );

  const stackedRef = useRef<HTMLDivElement>(null);
  const {width} = useDimensions<HTMLDivElement>({elementRef: stackedRef});

  if (!replay) {
    return <Placeholder height="20px" />;
  }

  const durationMs = replay.getDurationMs();
  const startTimestampMs = replay.getStartTimestampMs();
  const chapterFrames = replay.getChapterFrames();
  const videoEvents = replay.getVideoEvents();

  // timeline is in the middle
  const initialTranslate = 0.5 / timelineScale;
  const percentComplete = divide(currentTime, durationMs);

  const starting = percentComplete < initialTranslate;
  const ending = percentComplete + initialTranslate > 1;

  const translate = () => {
    if (starting) {
      return 0;
    }
    if (ending) {
      return initialTranslate - (1 - initialTranslate);
    }
    return initialTranslate - (currentTime > durationMs ? 1 : percentComplete);
  };

  return (
    <VisiblePanel ref={panelRef} {...mouseTrackingProps}>
      <Stacked
        style={{
          width: `${toPercent(timelineScale)}`,
          transform: `translate(${toPercent(translate())}, 0%)`,
        }}
        ref={stackedRef}
      >
        <MinorGridlines durationMs={durationMs} width={width} />
        <MajorGridlines durationMs={durationMs} width={width} />
        <TimelineScrubber />
        <TimelineGaps
          durationMs={durationMs}
          startTimestampMs={startTimestampMs}
          videoEvents={videoEvents}
        />
        <TimelineEventsContainer>
          <ReplayTimelineEvents
            durationMs={durationMs}
            frames={chapterFrames}
            startTimestampMs={startTimestampMs}
            width={width}
          />
        </TimelineEventsContainer>
      </Stacked>
    </VisiblePanel>
  );
}

const VisiblePanel = styled(Panel)`
  margin: 0;
  border: 0;
  overflow: hidden;
  background: ${p => p.theme.translucentInnerBorder};
`;

const TimelineEventsContainer = styled('div')`
  padding-top: 10px;
  padding-bottom: 10px;
`;
