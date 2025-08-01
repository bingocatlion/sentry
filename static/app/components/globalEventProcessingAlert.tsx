import {Fragment} from 'react';

import {Alert} from 'sentry/components/core/alert';
import {ExternalLink} from 'sentry/components/core/link';
import {tct} from 'sentry/locale';
import type {Project} from 'sentry/types/project';

const sentryStatusPageLink = 'https://status.sentry.io/';

type Props = {
  projects: Project[];
  className?: string;
};

// This alert makes the user aware that one or more projects have been selected for the Low Priority Queue
function GlobalEventProcessingAlert({className, projects}: Props) {
  const projectsInTheLowPriorityQueue = projects.filter(
    project => project?.eventProcessing?.symbolicationDegraded
  );

  if (!projectsInTheLowPriorityQueue.length) {
    return null;
  }

  return (
    <Alert.Container>
      <Alert className={className} type="info">
        {projectsInTheLowPriorityQueue.length === 1
          ? tct(
              'Event Processing for this project is currently degraded. Events may appear with larger delays than usual or get dropped. Please check the [link:Status] page for a potential outage.',
              {
                link: <ExternalLink href={sentryStatusPageLink} />,
              }
            )
          : tct(
              'Event Processing for the [projectSlugs] projects is currently degraded. Events may appear with larger delays than usual or get dropped. Please check the [link:Status] page for a potential outage.',
              {
                projectSlugs: projectsInTheLowPriorityQueue.map(({slug}, index) => (
                  <Fragment key={slug}>
                    <strong>{slug}</strong>
                    {index !== projectsInTheLowPriorityQueue.length - 1 && ', '}
                  </Fragment>
                )),
                link: <ExternalLink href={sentryStatusPageLink} />,
              }
            )}
      </Alert>
    </Alert.Container>
  );
}

export default GlobalEventProcessingAlert;
