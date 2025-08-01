import {Fragment, useEffect, useState} from 'react';
import {useTheme} from '@emotion/react';
import styled from '@emotion/styled';
import {AnimatePresence, type AnimationProps, motion} from 'framer-motion';

import {bulkDelete, bulkUpdate, mergeGroups} from 'sentry/actionCreators/group';
import {
  addErrorMessage,
  addLoadingMessage,
  clearIndicators,
} from 'sentry/actionCreators/indicator';
import {Alert} from 'sentry/components/core/alert';
import {Checkbox} from 'sentry/components/core/checkbox';
import {Flex} from 'sentry/components/core/layout';
import IssueStreamHeaderLabel from 'sentry/components/IssueStreamHeaderLabel';
import {Sticky} from 'sentry/components/sticky';
import {t, tct, tn} from 'sentry/locale';
import GroupStore from 'sentry/stores/groupStore';
import ProjectsStore from 'sentry/stores/projectsStore';
import SelectedGroupStore from 'sentry/stores/selectedGroupStore';
import {useLegacyStore} from 'sentry/stores/useLegacyStore';
import {space} from 'sentry/styles/space';
import type {PageFilters} from 'sentry/types/core';
import type {Group} from 'sentry/types/group';
import {defined} from 'sentry/utils';
import {trackAnalytics} from 'sentry/utils/analytics';
import {uniq} from 'sentry/utils/array/uniq';
import {useQueryClient} from 'sentry/utils/queryClient';
import useApi from 'sentry/utils/useApi';
import useMedia from 'sentry/utils/useMedia';
import useOrganization from 'sentry/utils/useOrganization';
import {useSyncedLocalStorageState} from 'sentry/utils/useSyncedLocalStorageState';
import type {IssueUpdateData} from 'sentry/views/issueList/types';
import {SAVED_SEARCHES_SIDEBAR_OPEN_LOCALSTORAGE_KEY} from 'sentry/views/issueList/utils';

import ActionSet from './actionSet';
import Headers from './headers';
import {BULK_LIMIT, BULK_LIMIT_STR, ConfirmAction} from './utils';

type IssueListActionsProps = {
  allResultsVisible: boolean;
  displayReprocessingActions: boolean;
  groupIds: string[];
  onDelete: () => void;
  onSelectStatsPeriod: (period: string) => void;
  query: string;
  queryCount: number;
  selection: PageFilters;
  statsPeriod: string;
  onActionTaken?: (itemIds: string[], data: IssueUpdateData) => void;
};

const animationProps: AnimationProps = {
  initial: {translateY: 8, opacity: 0},
  animate: {translateY: 0, opacity: 1},
  exit: {translateY: -8, opacity: 0},
  transition: {duration: 0.1},
};

function ActionsBarPriority({
  anySelected,
  narrowViewport,
  displayReprocessingActions,
  pageSelected,
  queryCount,
  selectedIdsSet,
  multiSelected,
  allInQuerySelected,
  query,
  handleDelete,
  handleMerge,
  handleUpdate,
  selectedProjectSlug,
  onSelectStatsPeriod,
  isSavedSearchesOpen,
  statsPeriod,
  selection,
}: {
  allInQuerySelected: boolean;
  anySelected: boolean;
  displayReprocessingActions: boolean;
  handleDelete: () => void;
  handleMerge: () => void;
  handleUpdate: (data: IssueUpdateData) => void;
  isSavedSearchesOpen: boolean;
  multiSelected: boolean;
  narrowViewport: boolean;
  onSelectStatsPeriod: (period: string) => void;
  pageSelected: boolean;
  query: string;
  queryCount: number;
  selectedIdsSet: Set<string>;
  selectedProjectSlug: string | undefined;
  selection: PageFilters;
  statsPeriod: string;
}) {
  const shouldDisplayActions = anySelected && !narrowViewport;

  return (
    <ActionsBarContainer>
      {!narrowViewport && (
        <ActionsCheckbox isReprocessingQuery={displayReprocessingActions}>
          <Checkbox
            onChange={() => SelectedGroupStore.toggleSelectAll()}
            checked={pageSelected || (anySelected ? 'indeterminate' : false)}
            aria-label={pageSelected ? t('Deselect all') : t('Select all')}
            disabled={displayReprocessingActions}
          />
        </ActionsCheckbox>
      )}
      {!displayReprocessingActions && (
        <AnimatePresence initial={false} mode="wait">
          {shouldDisplayActions ? (
            <HeaderButtonsWrapper key="actions" {...animationProps}>
              <ActionSet
                queryCount={queryCount}
                query={query}
                issues={selectedIdsSet}
                allInQuerySelected={allInQuerySelected}
                anySelected={anySelected}
                multiSelected={multiSelected}
                selectedProjectSlug={selectedProjectSlug}
                onShouldConfirm={action =>
                  shouldConfirm(action, {pageSelected, selectedIdsSet})
                }
                onDelete={handleDelete}
                onMerge={handleMerge}
                onUpdate={handleUpdate}
              />
            </HeaderButtonsWrapper>
          ) : (
            <NarrowHeaderButtonsWrapper>
              <IssueStreamHeaderLabel hideDivider>{t('Issue')}</IssueStreamHeaderLabel>
            </NarrowHeaderButtonsWrapper>
          )}
        </AnimatePresence>
      )}
      <AnimatePresence initial={false} mode="wait">
        {anySelected ? null : (
          <AnimatedHeaderItemsContainer key="headers" {...animationProps}>
            <Headers
              onSelectStatsPeriod={onSelectStatsPeriod}
              selection={selection}
              statsPeriod={statsPeriod}
              isReprocessingQuery={displayReprocessingActions}
              isSavedSearchesOpen={isSavedSearchesOpen}
            />
          </AnimatedHeaderItemsContainer>
        )}
      </AnimatePresence>
    </ActionsBarContainer>
  );
}

function IssueListActions({
  allResultsVisible,
  displayReprocessingActions,
  groupIds,
  onActionTaken,
  onDelete,
  onSelectStatsPeriod,
  queryCount,
  query,
  selection,
  statsPeriod,
}: IssueListActionsProps) {
  const api = useApi();
  const queryClient = useQueryClient();
  const organization = useOrganization();
  const {
    pageSelected,
    multiSelected,
    anySelected,
    allInQuerySelected,
    selectedIdsSet,
    selectedProjectSlug,
    setAllInQuerySelected,
  } = useSelectedGroupsState();
  const [isSavedSearchesOpen] = useSyncedLocalStorageState(
    SAVED_SEARCHES_SIDEBAR_OPEN_LOCALSTORAGE_KEY,
    false
  );
  const theme = useTheme();

  const disableActions = useMedia(
    `(max-width: ${isSavedSearchesOpen ? theme.breakpoints.xl : theme.breakpoints.md})`
  );

  const numIssues = selectedIdsSet.size;

  function actionSelectedGroups(callback: (itemIds: string[] | undefined) => void) {
    const selectedIds = allInQuerySelected
      ? undefined // undefined means "all"
      : groupIds.filter(itemId => selectedIdsSet.has(itemId));

    callback(selectedIds);

    SelectedGroupStore.deselectAll();
  }

  // TODO: Remove issue.category:error filter when merging/deleting performance issues is supported
  // This silently avoids performance issues for bulk actions
  const queryExcludingPerformanceIssues = `${query ?? ''} issue.category:error`;

  function handleDelete() {
    actionSelectedGroups(itemIds => {
      bulkDelete(
        api,
        {
          orgId: organization.slug,
          itemIds,
          query: queryExcludingPerformanceIssues,
          project: selection.projects,
          environment: selection.environments,
          ...selection.datetime,
        },
        {
          complete: () => {
            onDelete();
          },
        }
      );
    });
  }

  function handleMerge() {
    actionSelectedGroups(itemIds => {
      mergeGroups(
        api,
        {
          orgId: organization.slug,
          itemIds,
          query: queryExcludingPerformanceIssues,
          project: selection.projects,
          environment: selection.environments,
          ...selection.datetime,
        },
        {}
      );
      if (selection.projects[0]) {
        const trackProject = ProjectsStore.getById(`${selection.projects[0]}`);
        trackAnalytics('issues_stream.merged', {
          organization,
          project_id: trackProject?.id,
          platform: trackProject?.platform,
          items_merged: allInQuerySelected ? 'all_in_query' : itemIds?.length,
        });
      }
    });
  }

  // If all selected groups are from the same project, return the project ID.
  // Otherwise, return the global selection projects. This is important because
  // resolution in release requires that a project is specified, but the global
  // selection may not have that information if My Projects is selected.
  function getSelectedProjectIds(selectedGroupIds: string[] | undefined) {
    if (!selectedGroupIds) {
      return selection.projects;
    }

    const groups = selectedGroupIds.map(id => GroupStore.get(id));

    const projectIds = new Set(groups.map(group => group?.project?.id).filter(defined));

    if (projectIds.size === 1) {
      return [...projectIds];
    }

    return selection.projects;
  }

  function handleUpdate(data: IssueUpdateData) {
    if ('status' in data && data.status === 'ignored') {
      const statusDetails =
        'ignoreCount' in data.statusDetails
          ? 'ignoreCount'
          : 'ignoreDuration' in data.statusDetails
            ? 'ignoreDuration'
            : 'ignoreUserCount' in data.statusDetails
              ? 'ignoreUserCount'
              : undefined;
      trackAnalytics('issues_stream.archived', {
        action_status_details: statusDetails,
        action_substatus: data.substatus,
        organization,
      });
    }

    if ('priority' in data) {
      trackAnalytics('issues_stream.updated_priority', {
        organization,
        priority: data.priority,
      });
    }

    actionSelectedGroups(itemIds => {
      // If `itemIds` is undefined then it means we expect to bulk update all items
      // that match the query.
      //
      // We need to always respect the projects selected in the global selection header:
      // * users with no global views requires a project to be specified
      // * users with global views need to be explicit about what projects the query will run against
      const projectConstraints = {project: getSelectedProjectIds(itemIds)};

      if (itemIds?.length) {
        addLoadingMessage(t('Saving changes\u2026'));
      }

      bulkUpdate(
        api,
        {
          orgId: organization.slug,
          itemIds,
          data,
          query,
          environment: selection.environments,
          failSilently: true,
          ...projectConstraints,
          ...selection.datetime,
        },
        {
          success: () => {
            clearIndicators();
            onActionTaken?.(itemIds ?? [], data);

            // Prevents stale data on issue details
            if (itemIds?.length) {
              for (const itemId of itemIds) {
                queryClient.invalidateQueries({
                  queryKey: [`/organizations/${organization.slug}/issues/${itemId}/`],
                  exact: false,
                });
              }
            } else {
              // If we're doing a full query update we invalidate all issue queries to be safe
              queryClient.invalidateQueries({
                predicate: apiQuery =>
                  typeof apiQuery.queryKey[0] === 'string' &&
                  apiQuery.queryKey[0].startsWith(
                    `/organizations/${organization.slug}/issues/`
                  ),
              });
            }
          },
          error: () => {
            clearIndicators();
            addErrorMessage(t('Unable to update issues'));
          },
        }
      );
    });
  }

  return (
    <StickyActions>
      <ActionsBarPriority
        query={query}
        queryCount={queryCount}
        selection={selection}
        statsPeriod={statsPeriod}
        allInQuerySelected={allInQuerySelected}
        pageSelected={pageSelected}
        selectedIdsSet={selectedIdsSet}
        displayReprocessingActions={displayReprocessingActions}
        handleDelete={handleDelete}
        handleMerge={handleMerge}
        handleUpdate={handleUpdate}
        multiSelected={multiSelected}
        narrowViewport={disableActions}
        selectedProjectSlug={selectedProjectSlug}
        isSavedSearchesOpen={isSavedSearchesOpen}
        anySelected={anySelected}
        onSelectStatsPeriod={onSelectStatsPeriod}
      />
      {!allResultsVisible && pageSelected && (
        <Alert system type="warning" showIcon={false}>
          <Flex justify="center" wrap="wrap" gap={space(1)}>
            {allInQuerySelected ? (
              queryCount >= BULK_LIMIT ? (
                tct(
                  'Selected up to the first [count] issues that match this search query.',
                  {
                    count: BULK_LIMIT_STR,
                  }
                )
              ) : (
                tct('Selected all [count] issues that match this search query.', {
                  count: queryCount,
                })
              )
            ) : (
              <Fragment>
                {tn(
                  '%s issue on this page selected.',
                  '%s issues on this page selected.',
                  numIssues
                )}

                <a onClick={() => setAllInQuerySelected(true)}>
                  {queryCount >= BULK_LIMIT
                    ? tct(
                        'Select the first [count] issues that match this search query.',
                        {
                          count: BULK_LIMIT_STR,
                        }
                      )
                    : tct('Select all [count] issues that match this search query.', {
                        count: queryCount,
                      })}
                </a>
              </Fragment>
            )}
          </Flex>
        </Alert>
      )}
    </StickyActions>
  );
}

function useSelectedGroupsState() {
  const [allInQuerySelected, setAllInQuerySelected] = useState(false);
  const selectedGroupState = useLegacyStore(SelectedGroupStore);
  const selectedIds = SelectedGroupStore.getSelectedIds();

  const projects = [...selectedIds]
    .map(id => GroupStore.get(id))
    .filter((group): group is Group => !!group?.project)
    .map(group => group.project.slug);

  const uniqProjects = uniq(projects);
  // we only want selectedProjectSlug set if there is 1 project
  // more or fewer should result in a null so that the action toolbar
  // can behave correctly.
  const selectedProjectSlug = uniqProjects.length === 1 ? uniqProjects[0] : undefined;

  const pageSelected = SelectedGroupStore.allSelected();
  const multiSelected = SelectedGroupStore.multiSelected();
  const anySelected = SelectedGroupStore.anySelected();
  const selectedIdsSet = SelectedGroupStore.getSelectedIds();

  useEffect(() => {
    setAllInQuerySelected(false);
  }, [selectedGroupState]);

  return {
    pageSelected,
    multiSelected,
    anySelected,
    allInQuerySelected,
    selectedIdsSet,
    selectedProjectSlug,
    setAllInQuerySelected,
  };
}

function shouldConfirm(
  action: ConfirmAction,
  {pageSelected, selectedIdsSet}: {pageSelected: boolean; selectedIdsSet: Set<string>}
) {
  switch (action) {
    case ConfirmAction.RESOLVE:
    case ConfirmAction.UNRESOLVE:
    case ConfirmAction.ARCHIVE:
    case ConfirmAction.SET_PRIORITY:
    case ConfirmAction.UNBOOKMARK: {
      return pageSelected && selectedIdsSet.size > 1;
    }
    case ConfirmAction.BOOKMARK:
      return selectedIdsSet.size > 1;
    case ConfirmAction.MERGE:
    case ConfirmAction.DELETE:
    default:
      return true; // By default, should confirm ...
  }
}

const StickyActions = styled(Sticky)`
  z-index: ${p => p.theme.zIndex.issuesList.stickyHeader};

  /* Remove border radius from the action bar when stuck. Without this there is
   * a small gap where color can peek through. */
  &[data-stuck] > div {
    border-radius: 0;
  }

  border-bottom: 1px solid ${p => p.theme.border};
  border-top: none;
  border-radius: ${p => p.theme.borderRadius} ${p => p.theme.borderRadius} 0 0;
`;

const ActionsBarContainer = styled('div')`
  display: flex;
  min-height: 36px;
  padding-top: ${space(0.5)};
  padding-bottom: ${space(0.5)};
  align-items: center;
  background: ${p => p.theme.backgroundSecondary};
  border-radius: 6px 6px 0 0;
`;

const ActionsCheckbox = styled('div')<{isReprocessingQuery: boolean}>`
  display: flex;
  align-items: center;
  padding-left: ${space(2)};
  margin-bottom: 1px;
  ${p => p.isReprocessingQuery && 'flex: 1'};
`;

const HeaderButtonsWrapper = styled(motion.div)`
  @media (min-width: ${p => p.theme.breakpoints.lg}) {
    width: 50%;
  }
  flex: 1;
  margin: 0 ${space(1)};
  display: grid;
  gap: ${space(0.5)};
  grid-auto-flow: column;
  justify-content: flex-start;
  white-space: nowrap;
`;

const NarrowHeaderButtonsWrapper = styled(motion.div)`
  @media (min-width: ${p => p.theme.breakpoints.lg}) {
    width: 50%;
  }
  flex: 1;
  margin-left: ${space(1)};
  margin-right: ${space(2)};
  display: grid;
  gap: ${space(0.5)};
  grid-auto-flow: column;
  justify-content: space-between;
  white-space: nowrap;
`;

const AnimatedHeaderItemsContainer = styled(motion.div)`
  display: flex;
  align-items: center;
`;

export {IssueListActions};

export default IssueListActions;
