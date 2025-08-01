import styled from '@emotion/styled';

import {ExternalLink} from 'sentry/components/core/link';
import {t} from 'sentry/locale';
import {space} from 'sentry/styles/space';
import {trackAnalytics} from 'sentry/utils/analytics';
import useOrganization from 'sentry/utils/useOrganization';

type Props = {
  /**
   * Content rendered instead the panel item
   */
  children?: React.ReactNode;
  /**
   * The text for the CTA link at the bottom of the panel item
   */
  cta?: string;
  /**
   * Has the item been seen? affects the styling of the panel item
   */
  hasSeen?: boolean;
  /**
   * The URL to use for the CTA
   */
  link?: string;
  /**
   * A message with muted styling which appears above the children content
   */
  message?: React.ReactNode;
  /**
   * The title of the sidebar item
   */
  title?: string;
  /**
   * Actions to the right of the title
   */
  titleAction?: React.ReactNode;
};

function SidebarPanelItem({
  hasSeen,
  title,
  message,
  link,
  cta,
  titleAction,
  children,
}: Props) {
  const organization = useOrganization();
  return (
    <SidebarPanelItemRoot>
      {title && (
        <TitleWrapper>
          <Title hasSeen={hasSeen}>{title}</Title>
          {titleAction}
        </TitleWrapper>
      )}
      {message && <Message>{message}</Message>}

      {children}

      {link && (
        <Text>
          <ExternalLink
            href={link}
            onClick={() => {
              if (!title) {
                return;
              }
              trackAnalytics('whats_new.link_clicked', {organization, title});
            }}
          >
            {cta || t('Read More')}
          </ExternalLink>
        </Text>
      )}
    </SidebarPanelItemRoot>
  );
}

export default SidebarPanelItem;

const SidebarPanelItemRoot = styled('div')`
  line-height: 1.5;
  background: ${p => p.theme.background};
  font-size: ${p => p.theme.fontSize.md};
  padding: ${space(3)};

  :not(:first-child) {
    border-top: 1px solid ${p => p.theme.innerBorder};
  }
`;

const TitleWrapper = styled('div')`
  display: flex;
  justify-content: space-between;
  gap: ${space(1)};
`;

const Title = styled('div')<Pick<Props, 'hasSeen'>>`
  font-size: ${p => p.theme.fontSize.lg};
  margin-bottom: ${space(1)};
  color: ${p => p.theme.textColor};
  ${p => !p.hasSeen && `font-weight: ${p.theme.fontWeight.bold};`}

  .culprit {
    font-weight: ${p => p.theme.fontWeight.normal};
  }
`;

const Text = styled('div')`
  margin: ${space(0.5)} 0;

  &:last-child {
    margin-bottom: 0;
  }
`;

const Message = styled(Text)`
  color: ${p => p.theme.subText};
`;
