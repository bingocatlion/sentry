import {OrganizationFixture} from 'sentry-fixture/organization';

import {render, screen, userEvent, waitFor} from 'sentry-test/reactTestingLibrary';
import selectEvent from 'sentry-test/selectEvent';

import ConfigStore from 'sentry/stores/configStore';
import type {Config} from 'sentry/types/system';
import {testableWindowLocation} from 'sentry/utils/testableWindowLocation';
import OrganizationCreate, {
  DATA_STORAGE_DOCS_LINK,
} from 'sentry/views/organizationCreate';

describe('OrganizationCreate', function () {
  let configstate: Config;

  beforeEach(() => {
    ConfigStore.get('termsUrl');
    ConfigStore.get('privacyUrl');

    configstate = ConfigStore.getState();

    // Set only a single region in the config store by default
    ConfigStore.set('regions', [{name: '--monolith--', url: 'https://example.com'}]);
  });

  afterEach(() => {
    MockApiClient.clearMockResponses();
    jest.resetAllMocks();
    ConfigStore.loadInitialData(configstate);
  });

  it('renders without terms', function () {
    render(<OrganizationCreate />);
  });

  it('renders with terms', function () {
    ConfigStore.set('termsUrl', 'https://example.com/terms');
    ConfigStore.set('privacyUrl', 'https://example.com/privacy');
    render(<OrganizationCreate />);
  });

  it('does not render relocation url for self-hosted', function () {
    ConfigStore.set('termsUrl', 'https://example.com/terms');
    ConfigStore.set('privacyUrl', 'https://example.com/privacy');
    ConfigStore.set('isSelfHosted', true);
    render(<OrganizationCreate />);

    expect(() =>
      screen.getByText('Relocating from self-hosted?', {exact: false})
    ).toThrow();
  });

  it('creates a new org', async function () {
    const orgCreateMock = MockApiClient.addMockResponse({
      url: '/organizations/',
      method: 'POST',
      body: OrganizationFixture(),
    });
    ConfigStore.set('termsUrl', 'https://example.com/terms');
    ConfigStore.set('privacyUrl', 'https://example.com/privacy');
    ConfigStore.set('isSelfHosted', false);
    ConfigStore.set('features', new Set(['relocation:enabled']));
    render(<OrganizationCreate />);
    expect(screen.getByText('Create a New Organization')).toBeInTheDocument();
    expect(
      screen.getByText('Relocating from self-hosted?', {exact: false})
    ).toBeInTheDocument();
    expect(screen.getByText('Relocating from self-hosted?')).toHaveAttribute(
      'href',
      '/relocation/'
    );

    await userEvent.type(screen.getByPlaceholderText('e.g. My Company'), 'Good Burger');
    await userEvent.click(
      screen.getByRole('checkbox', {
        name: 'I agree to the Terms of Service and the Privacy Policy',
      })
    );
    await userEvent.click(screen.getByText('Create Organization'));

    await waitFor(() => {
      expect(orgCreateMock).toHaveBeenCalledWith('/organizations/', {
        success: expect.any(Function),
        error: expect.any(Function),
        method: 'POST',
        data: {agreeTerms: true, defaultTeam: true, name: 'Good Burger'},
        host: undefined,
      });
    });
    expect(testableWindowLocation.assign).toHaveBeenCalledTimes(1);
    expect(testableWindowLocation.assign).toHaveBeenCalledWith(
      '/organizations/org-slug/projects/new/'
    );
  });

  it('creates a new org with customer domain feature', async function () {
    const orgCreateMock = MockApiClient.addMockResponse({
      url: '/organizations/',
      method: 'POST',
      body: OrganizationFixture(),
    });
    ConfigStore.set('features', new Set(['system:multi-region']));
    ConfigStore.set('termsUrl', 'https://example.com/terms');
    ConfigStore.set('privacyUrl', 'https://example.com/privacy');
    render(<OrganizationCreate />);
    expect(screen.getByText('Create a New Organization')).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText('e.g. My Company'), 'Good Burger');
    await userEvent.click(
      screen.getByRole('checkbox', {
        name: 'I agree to the Terms of Service and the Privacy Policy',
      })
    );
    await userEvent.click(screen.getByText('Create Organization'));

    await waitFor(() => {
      expect(orgCreateMock).toHaveBeenCalledWith('/organizations/', {
        data: {agreeTerms: true, defaultTeam: true, name: 'Good Burger'},
        method: 'POST',
        success: expect.any(Function),
        error: expect.any(Function),
        host: undefined,
      });
    });

    expect(testableWindowLocation.assign).toHaveBeenCalledTimes(1);
    expect(testableWindowLocation.assign).toHaveBeenCalledWith(
      'https://org-slug.sentry.io/projects/new/'
    );
  });

  function multiRegionSetup() {
    const orgCreateMock = MockApiClient.addMockResponse({
      url: '/organizations/',
      method: 'POST',
      body: OrganizationFixture(),
    });

    ConfigStore.set('regions', [
      {url: 'https://us.example.com', name: 'us'},
      {
        url: 'https://de.example.com',
        name: 'de',
      },
    ]);

    return orgCreateMock;
  }

  it('renders without region data and submits without host when only a single region is defined', async function () {
    const orgCreateMock = multiRegionSetup();
    // Set only a single region in the config store
    ConfigStore.set('regions', [{name: '--monolith--', url: 'https://example.com'}]);
    ConfigStore.set('features', new Set(['system:multi-region']));

    render(<OrganizationCreate />);
    expect(screen.queryByLabelText('Data Storage Location')).not.toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText('e.g. My Company'), 'Good Burger');
    await userEvent.click(screen.getByText('Create Organization'));

    await waitFor(() => {
      expect(orgCreateMock).toHaveBeenCalledWith('/organizations/', {
        success: expect.any(Function),
        error: expect.any(Function),
        method: 'POST',
        host: undefined,
        data: {defaultTeam: true, name: 'Good Burger'},
      });
    });

    expect(testableWindowLocation.assign).toHaveBeenCalledTimes(1);
    expect(testableWindowLocation.assign).toHaveBeenCalledWith(
      'https://org-slug.sentry.io/projects/new/'
    );
  });

  it('renders without a pre-selected region, and does not submit until one is selected', async function () {
    ConfigStore.set('features', new Set(['system:multi-region']));

    const orgCreateMock = multiRegionSetup();
    render(<OrganizationCreate />);
    expect(screen.getByLabelText('Data Storage Location')).toBeInTheDocument();
    const link = screen.getByText<HTMLAnchorElement>('Learn More');
    expect(link).toBeInTheDocument();
    expect(link.href).toBe(DATA_STORAGE_DOCS_LINK);
    await userEvent.type(screen.getByPlaceholderText('e.g. My Company'), 'Good Burger');
    await userEvent.click(screen.getByText('Create Organization'));

    expect(orgCreateMock).not.toHaveBeenCalled();
    expect(testableWindowLocation.assign).not.toHaveBeenCalled();

    await selectEvent.select(
      screen.getByRole('textbox', {name: 'Data Storage Location'}),
      '🇺🇸 United States of America (US)'
    );
    await userEvent.click(screen.getByText('Create Organization'));

    const expectedHost = 'https://us.example.com';
    await waitFor(() => {
      expect(orgCreateMock).toHaveBeenCalledWith('/organizations/', {
        success: expect.any(Function),
        error: expect.any(Function),
        method: 'POST',
        host: expectedHost,
        data: {defaultTeam: true, name: 'Good Burger'},
      });
    });

    expect(testableWindowLocation.assign).toHaveBeenCalledTimes(1);
    expect(testableWindowLocation.assign).toHaveBeenCalledWith(
      'https://org-slug.sentry.io/projects/new/'
    );
  });

  it('uses the host of the selected region when submitting', async function () {
    ConfigStore.set('features', new Set(['system:multi-region']));

    const orgCreateMock = multiRegionSetup();
    render(<OrganizationCreate />);
    expect(screen.getByLabelText('Data Storage Location')).toBeInTheDocument();
    const link = screen.getByText<HTMLAnchorElement>('Learn More');
    expect(link).toBeInTheDocument();
    expect(link.href).toBe(DATA_STORAGE_DOCS_LINK);
    await userEvent.type(screen.getByPlaceholderText('e.g. My Company'), 'Good Burger');
    await selectEvent.select(
      screen.getByRole('textbox', {name: 'Data Storage Location'}),
      '🇪🇺 European Union (EU)'
    );
    await userEvent.click(screen.getByText('Create Organization'));

    const expectedHost = 'https://de.example.com';
    await waitFor(() => {
      expect(orgCreateMock).toHaveBeenCalledWith('/organizations/', {
        success: expect.any(Function),
        error: expect.any(Function),
        method: 'POST',
        host: expectedHost,
        data: {defaultTeam: true, name: 'Good Burger'},
      });
    });

    expect(testableWindowLocation.assign).toHaveBeenCalledTimes(1);
    expect(testableWindowLocation.assign).toHaveBeenCalledWith(
      'https://org-slug.sentry.io/projects/new/'
    );
  });
});
