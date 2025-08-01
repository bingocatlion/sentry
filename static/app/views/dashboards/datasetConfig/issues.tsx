import type {Client} from 'sentry/api';
import {joinQuery, parseSearch, Token} from 'sentry/components/searchSyntax/parser';
import {t} from 'sentry/locale';
import GroupStore from 'sentry/stores/groupStore';
import type {PageFilters} from 'sentry/types/core';
import type {Group} from 'sentry/types/group';
import type {Organization} from 'sentry/types/organization';
import {getIssueFieldRenderer} from 'sentry/utils/dashboards/issueFieldRenderers';
import {getUtcDateString} from 'sentry/utils/dates';
import type {TableData, TableDataRow} from 'sentry/utils/discover/discoverQuery';
import type {QueryFieldValue} from 'sentry/utils/discover/fields';
import type {OnDemandControlContext} from 'sentry/utils/performance/contexts/onDemandControl';
import type {Widget, WidgetQuery} from 'sentry/views/dashboards/types';
import {DEFAULT_TABLE_LIMIT, DisplayType} from 'sentry/views/dashboards/types';
import {IssuesSearchBar} from 'sentry/views/dashboards/widgetBuilder/buildSteps/filterResultsStep/issuesSearchBar';
import {
  ISSUE_FIELD_TO_HEADER_MAP,
  ISSUE_FIELDS,
} from 'sentry/views/dashboards/widgetBuilder/issueWidget/fields';
import {generateIssueWidgetFieldOptions} from 'sentry/views/dashboards/widgetBuilder/issueWidget/utils';
import {FieldValueKind} from 'sentry/views/discover/table/types';
import {
  DISCOVER_EXCLUSION_FIELDS,
  getSortLabel,
  IssueSortOptions,
} from 'sentry/views/issueList/utils';

import type {DatasetConfig} from './base';

const DEFAULT_WIDGET_QUERY: WidgetQuery = {
  name: '',
  fields: ['issue', 'assignee', 'title'] as string[],
  columns: ['issue', 'assignee', 'title'],
  fieldAliases: [],
  aggregates: [],
  conditions: '',
  orderby: IssueSortOptions.DATE,
};

const DEFAULT_SORT = IssueSortOptions.DATE;
const DEFAULT_EXPAND = ['owners'];

const DEFAULT_FIELD: QueryFieldValue = {
  field: 'issue',
  kind: FieldValueKind.FIELD,
};

type EndpointParams = Partial<PageFilters['datetime']> & {
  environment: string[];
  project: number[];
  collapse?: string[];
  cursor?: string;
  expand?: string[];
  groupStatsPeriod?: string | null;
  limit?: number;
  page?: number | string;
  query?: string;
  sort?: string;
  statsPeriod?: string | null;
};

export const IssuesConfig: DatasetConfig<never, Group[]> = {
  defaultField: DEFAULT_FIELD,
  defaultWidgetQuery: DEFAULT_WIDGET_QUERY,
  enableEquations: false,
  disableSortOptions,
  getTableRequest,
  getCustomFieldRenderer: getIssueFieldRenderer,
  SearchBar: IssuesSearchBar,
  getTableSortOptions,
  getTableFieldOptions: (_organization: Organization) =>
    generateIssueWidgetFieldOptions(),
  getFieldHeaderMap: () => ISSUE_FIELD_TO_HEADER_MAP,
  supportedDisplayTypes: [DisplayType.TABLE],
  transformTable: transformIssuesResponseToTable,
};

function disableSortOptions(_widgetQuery: WidgetQuery) {
  return {
    disableSort: false,
    disableSortDirection: true,
    disableSortReason: t('Issues dataset does not yet support sorting in opposite order'),
  };
}

function getTableSortOptions(_organization: Organization, _widgetQuery: WidgetQuery) {
  const sortOptions = [
    IssueSortOptions.DATE,
    IssueSortOptions.NEW,
    IssueSortOptions.TRENDS,
    IssueSortOptions.FREQ,
    IssueSortOptions.USER,
  ];
  return sortOptions.map(sortOption => ({
    label: getSortLabel(sortOption),
    value: sortOption,
  }));
}

export function transformIssuesResponseToTable(
  data: Group[],
  widgetQuery: WidgetQuery,
  _organization: Organization,
  pageFilters: PageFilters
): TableData {
  GroupStore.add(data);
  const transformedTableResults: TableDataRow[] = [];
  data.forEach(
    ({
      id,
      shortId,
      title,
      lifetime,
      filtered,
      count,
      userCount,
      project,
      annotations,
      ...resultProps
    }) => {
      const transformedResultProps: Omit<TableDataRow, 'id'> = {};
      Object.keys(resultProps)
        // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        .filter(key => ['number', 'string'].includes(typeof resultProps[key]))
        .forEach(key => {
          // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
          transformedResultProps[key] = resultProps[key];
        });

      const transformedTableResult: TableDataRow = {
        ...transformedResultProps,
        events: count,
        users: userCount,
        id,
        'issue.id': id,
        issue: shortId,
        title,
        project: project.slug,
        links: (annotations ?? []) as any,
      };

      // Get lifetime stats
      if (lifetime) {
        transformedTableResult.lifetimeEvents = lifetime?.count;
        transformedTableResult.lifetimeUsers = lifetime?.userCount;
      }
      // Get filtered stats
      if (filtered) {
        transformedTableResult.filteredEvents = filtered?.count;
        transformedTableResult.filteredUsers = filtered?.userCount;
      }

      // Discover Url properties
      const query = widgetQuery.conditions;
      const parsedResult = parseSearch(query);
      const filteredTerms = parsedResult?.filter(
        p => !(p.type === Token.FILTER && DISCOVER_EXCLUSION_FIELDS.includes(p.key.text))
      );

      transformedTableResult.discoverSearchQuery = joinQuery(filteredTerms, true);
      transformedTableResult.projectId = project.id;

      const {period, start, end} = pageFilters.datetime || {};
      if (start && end) {
        transformedTableResult.start = getUtcDateString(start);
        transformedTableResult.end = getUtcDateString(end);
      }
      transformedTableResult.period = period ?? '';
      transformedTableResults.push(transformedTableResult);
    }
  );

  return {
    data: transformedTableResults,
    meta: {fields: ISSUE_FIELDS},
  };
}

function getTableRequest(
  api: Client,
  _: Widget,
  query: WidgetQuery,
  organization: Organization,
  pageFilters: PageFilters,
  __?: OnDemandControlContext,
  limit?: number,
  cursor?: string
) {
  const groupListUrl = `/organizations/${organization.slug}/issues/`;

  const params: EndpointParams = {
    project: pageFilters.projects ?? [],
    environment: pageFilters.environments ?? [],
    query: query.conditions,
    sort: query.orderby || DEFAULT_SORT,
    expand: DEFAULT_EXPAND,
    limit: limit ?? DEFAULT_TABLE_LIMIT,
    cursor,
  };

  if (pageFilters.datetime.period) {
    params.statsPeriod = pageFilters.datetime.period;
  }
  if (pageFilters.datetime.end) {
    params.end = getUtcDateString(pageFilters.datetime.end);
  }
  if (pageFilters.datetime.start) {
    params.start = getUtcDateString(pageFilters.datetime.start);
  }
  if (pageFilters.datetime.utc) {
    params.utc = pageFilters.datetime.utc;
  }

  return api.requestPromise(groupListUrl, {
    includeAllArgs: true,
    method: 'GET',
    data: {
      ...params,
    },
  });
}
