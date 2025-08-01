import {Fragment} from 'react';
import {type Theme, useTheme} from '@emotion/react';
import type {Location} from 'history';

import type {CursorHandler} from 'sentry/components/pagination';
import Pagination from 'sentry/components/pagination';
import GridEditable, {
  COL_WIDTH_UNDEFINED,
  type GridColumnHeader,
} from 'sentry/components/tables/gridEditable';
import {t} from 'sentry/locale';
import type {Organization} from 'sentry/types/organization';
import type {EventsMetaType} from 'sentry/utils/discover/eventView';
import {getFieldRenderer} from 'sentry/utils/discover/fieldRenderers';
import {RATE_UNIT_TITLE, RateUnit, type Sort} from 'sentry/utils/discover/fields';
import {useLocation} from 'sentry/utils/useLocation';
import {useNavigate} from 'sentry/utils/useNavigate';
import useOrganization from 'sentry/utils/useOrganization';
import {renderHeadCell} from 'sentry/views/insights/common/components/tableCells/renderHeadCell';
import {QueryParameterNames} from 'sentry/views/insights/common/views/queryParameters';
import {DataTitles} from 'sentry/views/insights/common/views/spans/types';
import {TransactionCell} from 'sentry/views/insights/http/components/tables/transactionCell';
import type {EAPSpanResponse} from 'sentry/views/insights/types';

type Row = Pick<
  EAPSpanResponse,
  | 'project.id'
  | 'transaction'
  | 'transaction.method'
  | 'epm()'
  | 'http_response_rate(3)'
  | 'http_response_rate(4)'
  | 'http_response_rate(5)'
  | 'avg(span.self_time)'
  | 'sum(span.self_time)'
>;

type Column = GridColumnHeader<
  | 'transaction'
  | 'epm()'
  | 'http_response_rate(3)'
  | 'http_response_rate(4)'
  | 'http_response_rate(5)'
  | 'avg(span.self_time)'
  | 'sum(span.self_time)'
>;

const COLUMN_ORDER: Column[] = [
  {
    key: 'transaction',
    name: t('Found In'),
    width: COL_WIDTH_UNDEFINED,
  },
  {
    key: 'epm()',
    name: `${t('Requests')} ${RATE_UNIT_TITLE[RateUnit.PER_MINUTE]}`,
    width: COL_WIDTH_UNDEFINED,
  },
  {
    key: `http_response_rate(3)`,
    name: t('3XXs'),
    width: 50,
  },
  {
    key: `http_response_rate(4)`,
    name: t('4XXs'),
    width: 50,
  },
  {
    key: `http_response_rate(5)`,
    name: t('5XXs'),
    width: 50,
  },
  {
    key: `avg(span.self_time)`,
    name: DataTitles.avg,
    width: COL_WIDTH_UNDEFINED,
  },
  {
    key: 'sum(span.self_time)',
    name: DataTitles.timeSpent,
    width: COL_WIDTH_UNDEFINED,
  },
];

const SORTABLE_FIELDS = [
  'avg(span.self_time)',
  'epm()',
  'http_response_rate(3)',
  'http_response_rate(4)',
  'http_response_rate(5)',
  'sum(span.self_time)',
] as const;

type ValidSort = Sort & {
  field: (typeof SORTABLE_FIELDS)[number];
};

export function isAValidSort(sort: Sort): sort is ValidSort {
  return (SORTABLE_FIELDS as unknown as string[]).includes(sort.field);
}

interface Props {
  data: Row[];
  isLoading: boolean;
  sort: ValidSort;
  domain?: string;
  error?: Error | null;
  meta?: EventsMetaType;
  pageLinks?: string;
}

export function DomainTransactionsTable({
  data,
  isLoading,
  error,
  meta,
  pageLinks,
  sort,
  domain,
}: Props) {
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const organization = useOrganization();

  const handleCursor: CursorHandler = (newCursor, pathname, query) => {
    navigate({
      pathname,
      query: {...query, [QueryParameterNames.TRANSACTIONS_CURSOR]: newCursor},
    });
  };

  return (
    <Fragment>
      <GridEditable
        aria-label={t('Transactions')}
        isLoading={isLoading}
        error={error}
        data={data}
        columnOrder={COLUMN_ORDER}
        columnSortBy={[
          {
            key: sort.field,
            order: sort.kind,
          },
        ]}
        grid={{
          renderHeadCell: col =>
            renderHeadCell({
              column: col,
              sort,
              location,
              sortParameterName: QueryParameterNames.TRANSACTIONS_SORT,
            }),
          renderBodyCell: (column, row) =>
            renderBodyCell(column, row, meta, domain, location, organization, theme),
        }}
      />

      <Pagination pageLinks={pageLinks} onCursor={handleCursor} />
    </Fragment>
  );
}

function renderBodyCell(
  column: Column,
  row: Row,
  meta: EventsMetaType | undefined,
  domain: string | undefined,
  location: Location,
  organization: Organization,
  theme: Theme
) {
  if (column.key === 'transaction') {
    return (
      <TransactionCell
        domain={domain}
        project={String(row['project.id'])}
        transaction={row.transaction}
        transactionMethod={row['transaction.method']}
      />
    );
  }

  if (!meta?.fields) {
    return row[column.key];
  }

  const renderer = getFieldRenderer(column.key, meta.fields, false);

  return renderer(
    {...row, 'span.op': 'http.client'},
    {
      location,
      organization,
      unit: meta.units?.[column.key],
      theme,
    }
  );
}
