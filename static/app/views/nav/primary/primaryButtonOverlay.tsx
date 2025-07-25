import {useTheme} from '@emotion/react';
import styled from '@emotion/styled';
import {FocusScope} from '@react-aria/focus';

import {Overlay, PositionWrapper} from 'sentry/components/overlay';
import {space} from 'sentry/styles/space';
import useOverlay, {type UseOverlayProps} from 'sentry/utils/useOverlay';
import {useNavContext} from 'sentry/views/nav/context';
import {NavLayout} from 'sentry/views/nav/types';

type PrimaryButtonOverlayProps = {
  children: React.ReactNode;
  overlayProps: React.HTMLAttributes<HTMLDivElement>;
};

export function usePrimaryButtonOverlay(props: UseOverlayProps = {}) {
  const {layout} = useNavContext();

  return useOverlay({
    offset: 8,
    position: layout === NavLayout.MOBILE ? 'bottom' : 'right-end',
    isDismissable: true,
    shouldApplyMinWidth: false,
    ...props,
  });
}

/**
 * Overlay to be used for primary navigation buttons in footer, such as
 * "what's new" and "onboarding". This will appear as a normal overlay
 * on desktop and a modified overlay in mobile to match the design of
 * the mobile topbar.
 */
export function PrimaryButtonOverlay({
  children,
  overlayProps,
}: PrimaryButtonOverlayProps) {
  const theme = useTheme();
  const {layout} = useNavContext();

  return (
    <FocusScope autoFocus restoreFocus>
      <PositionWrapper zIndex={theme.zIndex.dropdown} {...overlayProps}>
        <ScrollableOverlay isMobile={layout === NavLayout.MOBILE}>
          {children}
        </ScrollableOverlay>
      </PositionWrapper>
    </FocusScope>
  );
}

const ScrollableOverlay = styled(Overlay, {
  shouldForwardProp: prop => prop !== 'isMobile',
})<{
  isMobile: boolean;
}>`
  min-height: 150px;
  max-height: ${p => (p.isMobile ? '80vh' : '60vh')};
  overflow-y: auto;
  width: ${p => (p.isMobile ? `calc(100vw - ${space(4)})` : '400px')};
`;
