import {ExternalLink} from 'sentry/components/core/link';
import {StepType} from 'sentry/components/onboarding/gettingStartedDoc/types';
import {
  type Docs,
  type DocsParams,
  type OnboardingConfig,
} from 'sentry/components/onboarding/gettingStartedDoc/types';
import {
  feedbackOnboardingJsLoader,
  replayOnboardingJsLoader,
} from 'sentry/gettingStartedDocs/javascript/jsLoader/jsLoader';
import {
  agentMonitoringOnboarding,
  AlternativeConfiguration,
  crashReportOnboardingPython,
  featureFlagOnboarding,
} from 'sentry/gettingStartedDocs/python/python';
import {t, tct} from 'sentry/locale';
import {
  getPythonInstallConfig,
  getPythonProfilingOnboarding,
} from 'sentry/utils/gettingStartedDocs/python';

type Params = DocsParams;

const getSdkSetupSnippet = (params: Params) => `
import sentry_sdk
from sentry_sdk.integrations.quart import QuartIntegration
from quart import Quart

sentry_sdk.init(
    dsn="${params.dsn.public}",
    integrations=[QuartIntegration()],
    # Add data like request headers and IP for users,
    # see https://docs.sentry.io/platforms/python/data-management/data-collected/ for more info
    send_default_pii=True,${
      params.isPerformanceSelected
        ? `
    # Set traces_sample_rate to 1.0 to capture 100%
    # of transactions for tracing.
    traces_sample_rate=1.0,`
        : ''
    }${
      params.isProfilingSelected &&
      params.profilingOptions?.defaultProfilingMode !== 'continuous'
        ? `
    # Set profiles_sample_rate to 1.0 to profile 100%
    # of sampled transactions.
    # We recommend adjusting this value in production.
    profiles_sample_rate=1.0,`
        : params.isProfilingSelected &&
            params.profilingOptions?.defaultProfilingMode === 'continuous'
          ? `
    # Set profile_session_sample_rate to 1.0 to profile 100%
    # of profile sessions.
    profile_session_sample_rate=1.0,
    # Set profile_lifecycle to "trace" to automatically
    # run the profiler on when there is an active transaction
    profile_lifecycle="trace",`
          : ''
    }
)
`;

const onboarding: OnboardingConfig = {
  introduction: () =>
    tct('The Quart integration adds support for the [link:Quart Web Framework].', {
      link: <ExternalLink href="https://quart.palletsprojects.com/" />,
    }),
  install: () => [
    {
      type: StepType.INSTALL,
      description: tct(
        'Install [code:sentry-sdk] from PyPI with the [code:quart] extra:',
        {
          code: <code />,
        }
      ),
      configurations: getPythonInstallConfig({packageName: 'sentry-sdk[quart]'}),
    },
  ],
  configure: (params: Params) => [
    {
      type: StepType.CONFIGURE,
      description: t(
        'To configure the SDK, initialize it with the integration before or after your app has been initialized:'
      ),
      configurations: [
        {
          language: 'python',
          code: `
${getSdkSetupSnippet(params)}
app = Quart(__name__)
`,
        },
      ],
      additionalInfo: <AlternativeConfiguration />,
    },
  ],
  verify: (params: Params) => [
    {
      type: StepType.VERIFY,
      description: t(
        'You can easily verify your Sentry installation by creating a route that triggers an error:'
      ),
      configurations: [
        {
          language: 'python',

          code: `
${getSdkSetupSnippet(params)}
app = Quart(__name__)

@app.route("/")
async def hello():
    1/0  # raises an error
    return {"hello": "world"}

app.run()
`,
        },
      ],
      additionalInfo: (
        <span>
          <p>
            {tct(
              'When you point your browser to [link:http://localhost:5000/] a transaction in the Performance section of Sentry will be created.',
              {
                link: <ExternalLink href="http://localhost:5000/" />,
              }
            )}
          </p>
          <p>
            {t(
              'Additionally, an error event will be sent to Sentry and will be connected to the transaction.'
            )}
          </p>
          <p>{t('It takes a couple of moments for the data to appear in Sentry.')}</p>
        </span>
      ),
    },
  ],
  nextSteps: () => [],
};

const docs: Docs = {
  onboarding,
  replayOnboardingJsLoader,
  profilingOnboarding: getPythonProfilingOnboarding({basePackage: 'sentry-sdk[quart]'}),
  crashReportOnboarding: crashReportOnboardingPython,
  featureFlagOnboarding,
  feedbackOnboardingJsLoader,
  agentMonitoringOnboarding,
};

export default docs;
