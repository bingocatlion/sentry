import {ProjectFixture} from 'sentry-fixture/project';
import {ReplayListFixture} from 'sentry-fixture/replayList';

import {initializeOrg} from 'sentry-test/initializeOrg';
import {render, screen, waitFor} from 'sentry-test/reactTestingLibrary';
import {resetMockDate, setMockDate} from 'sentry-test/utils';

import ProjectsStore from 'sentry/stores/projectsStore';
import {
  SPAN_OP_BREAKDOWN_FIELDS,
  SPAN_OP_RELATIVE_BREAKDOWN_FIELD,
} from 'sentry/utils/discover/fields';
import TransactionReplays from 'sentry/views/performance/transactionSummary/transactionReplays';

type InitializeOrgProps = {
  location?: {
    pathname?: string;
    query?: Record<string, string>;
  };
  organizationProps?: {
    features?: string[];
  };
};

jest.mock('sentry/utils/useMedia', () => ({
  __esModule: true,
  default: jest.fn(() => true),
}));

const mockEventsUrl = '/organizations/org-slug/events/';
const mockReplaysUrl = '/organizations/org-slug/replays/';

const renderComponent = ({
  location,
  organizationProps = {features: ['performance-view', 'session-replay']},
}: InitializeOrgProps = {}) => {
  const {organization, projects, router} = initializeOrg({
    organization: {
      ...organizationProps,
    },
    projects: [ProjectFixture()],
    router: {
      routes: [
        {path: '/'},
        {path: '/organizations/:orgId/insights/summary/'},
        {path: 'replays/'},
      ],
      location: {
        pathname: '/organizations/org-slug/replays/',
        ...location,
        query: {
          project: '1',
          transaction: 'Settings Page',
          ...location?.query,
        },
      },
    },
  });

  ProjectsStore.init();
  ProjectsStore.loadInitialData(projects);

  return render(<TransactionReplays />, {
    router,
    organization,
    deprecatedRouterMocks: true,
  });
};

describe('TransactionReplays', () => {
  let eventsMockApi: jest.Mock<any, any>;
  let replaysMockApi: jest.Mock<any, any>;
  beforeEach(() => {
    MockApiClient.addMockResponse({
      method: 'GET',
      url: `/organizations/org-slug/sdk-updates/`,
      body: [],
    });
    MockApiClient.addMockResponse({
      url: '/organizations/org-slug/events-has-measurements/',
      body: {measurements: false},
    });
    MockApiClient.addMockResponse({
      url: '/organizations/org-slug/replay-count/',
      body: {
        data: [],
      },
      statusCode: 200,
    });
    eventsMockApi = MockApiClient.addMockResponse({
      url: '/organizations/org-slug/events/',
      body: {
        data: [],
      },
      statusCode: 200,
    });
    replaysMockApi = MockApiClient.addMockResponse({
      url: '/organizations/org-slug/replays/',
      body: {
        data: [],
      },
      statusCode: 200,
    });
  });

  afterEach(() => {
    MockApiClient.clearMockResponses();
    resetMockDate();
  });

  it('should query the events endpoint for replayIds of a transaction', async () => {
    renderComponent();

    await waitFor(() => {
      expect(eventsMockApi).toHaveBeenCalledWith(
        '/organizations/org-slug/events/',
        expect.objectContaining({
          query: expect.objectContaining({
            cursor: undefined,
            statsPeriod: '14d',
            project: ['1'],
            environment: [],
            field: expect.arrayContaining([
              'replayId',
              'count()',
              'transaction.duration',
              'trace',
              'timestamp',
              ...SPAN_OP_BREAKDOWN_FIELDS,
              SPAN_OP_RELATIVE_BREAKDOWN_FIELD,
            ]),
            per_page: 50,
            query: 'event.type:transaction transaction:"Settings Page" !replayId:""',
          }),
        })
      );
    });
  });

  it('should snapshot empty state', async () => {
    const mockApi = MockApiClient.addMockResponse({
      url: mockReplaysUrl,
      body: {
        data: [],
      },
      statusCode: 200,
    });

    renderComponent();

    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledTimes(1);
    });
  });

  it('should show empty message when no replays are found', async () => {
    renderComponent();

    await waitFor(() => {
      expect(replaysMockApi).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText('No replays found')).toBeInTheDocument();
  });

  it('should show loading indicator when loading replays', async () => {
    const mockApi = MockApiClient.addMockResponse({
      url: mockEventsUrl,
      statusCode: 200,
      body: {
        data: [],
      },
    });

    renderComponent();

    expect(screen.getByTestId('loading-indicator')).toBeInTheDocument();
    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledTimes(1);
    });
  });

  it('should show a list of replays and have the correct values', async () => {
    const mockApi = MockApiClient.addMockResponse({
      url: mockReplaysUrl,
      statusCode: 200,
      body: {
        data: [
          {
            ...ReplayListFixture()[0],
            count_errors: 1,
            duration: 52346,
            finished_at: new Date('2022-09-15T06:54:00+00:00'),
            id: '346789a703f6454384f1de473b8b9fcc',
            started_at: new Date('2022-09-15T06:50:00+00:00'),
            urls: [
              'https://dev.getsentry.net:7999/organizations/sentry-emerging-tech/replays/',
              '/organizations/sentry-emerging-tech/replays/?project=2',
            ],
          },
          {
            ...ReplayListFixture()[0],
            count_errors: 4,
            duration: 400,
            finished_at: new Date('2022-09-21T21:40:38+00:00'),
            id: 'b05dae9b6be54d21a4d5ad9f8f02b780',
            started_at: new Date('2022-09-21T21:30:44+00:00'),
            urls: [
              'https://dev.getsentry.net:7999/organizations/sentry-emerging-tech/replays/?project=2&statsPeriod=24h',
              '/organizations/sentry-emerging-tech/issues/',
              '/organizations/sentry-emerging-tech/issues/?project=2',
            ],
          },
        ].map(hydrated => ({
          ...hydrated,
          started_at: hydrated.started_at.toString(),
          finished_at: hydrated.finished_at.toString(),
        })),
      },
    });

    // Mock the system date to be 2022-09-28
    setMockDate(new Date('Sep 28, 2022 11:29:13 PM UTC'));

    renderComponent({location: {query: {query: 'test'}}});

    await waitFor(() => {
      expect(mockApi).toHaveBeenCalledTimes(1);
    });

    // Expect the table to have 2 rows
    expect(screen.getAllByText('testDisplayName')).toHaveLength(2);

    const expectedQuery =
      'project=1&query=test&referrer=%2Forganizations%2F%3AorgId%2Finsights%2Fsummary%2Freplays%2F&statsPeriod=14d&yAxis=count%28%29';
    // Expect the first row to have the correct href
    expect(
      screen.getByRole('link', {
        name: 'T testDisplayName project-slug 346789a7 14 days ago',
      })
    ).toHaveAttribute(
      'href',
      `/organizations/org-slug/replays/346789a703f6454384f1de473b8b9fcc/?${expectedQuery}`
    );

    // Expect the second row to have the correct href
    expect(
      screen.getByRole('link', {
        name: 'T testDisplayName project-slug b05dae9b 7 days ago',
      })
    ).toHaveAttribute(
      'href',
      `/organizations/org-slug/replays/b05dae9b6be54d21a4d5ad9f8f02b780/?${expectedQuery}`
    );

    // Expect the first row to have the correct duration
    expect(screen.getByText('14:32:26')).toBeInTheDocument();

    // Expect the second row to have the correct duration
    expect(screen.getByText('06:40')).toBeInTheDocument();

    // Expect the first row to have the correct errors
    expect(
      screen.getAllByTestId('replay-table-column-count-errors')[0]
    ).toHaveTextContent('1');

    // Expect the second row to have the correct errors
    expect(
      screen.getAllByTestId('replay-table-column-count-errors')[1]
    ).toHaveTextContent('4');

    // Expect the first row to have the correct date
    expect(screen.getByText('14 days ago')).toBeInTheDocument();

    // Expect the second row to have the correct date
    expect(screen.getByText('7 days ago')).toBeInTheDocument();
  });

  it("should show a message when the organization doesn't have access to the replay feature", async () => {
    renderComponent({
      organizationProps: {
        features: ['performance-view'],
      },
    });

    await waitFor(() => {
      expect(
        screen.getByText("You don't have access to this feature")
      ).toBeInTheDocument();
    });
  });
});
