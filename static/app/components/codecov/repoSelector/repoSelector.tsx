import {useCallback, useEffect, useMemo, useState} from 'react';
import styled from '@emotion/styled';
import debounce from 'lodash/debounce';

import {useCodecovContext} from 'sentry/components/codecov/context/codecovContext';
import {useInfiniteRepositories} from 'sentry/components/codecov/repoSelector/useInfiniteRepositories';
import {Button} from 'sentry/components/core/button';
import type {SelectOption} from 'sentry/components/core/compactSelect';
import {CompactSelect} from 'sentry/components/core/compactSelect';
import {Flex} from 'sentry/components/core/layout';
import {Link} from 'sentry/components/core/link';
import DropdownButton from 'sentry/components/dropdownButton';
import {IconInfo, IconSync} from 'sentry/icons';
import {t, tct} from 'sentry/locale';
import {space} from 'sentry/styles/space';

import {IconRepository} from './iconRepository';

function SyncRepoButton() {
  return (
    <StyledButtonContainer>
      <StyledButton
        borderless
        aria-label={t('Sync Now')}
        // TODO: Adjust when sync endpoint is ready
        onClick={() => {}}
        size="xs"
        icon={<IconSync />}
      >
        sync now
      </StyledButton>
    </StyledButtonContainer>
  );
}

interface MenuFooterProps {
  repoAccessLink: string;
}

function MenuFooter({repoAccessLink}: MenuFooterProps) {
  return (
    <FooterTip>
      <IconInfo size="xs" />
      <span>
        {tct(
          "Sentry only displays repos you've authorized. Manage [repoAccessLink] in your GitHub settings.",
          {
            // TODO: adjust link when backend gives specific GH installation
            repoAccessLink: <Link to={repoAccessLink}>repo access</Link>,
          }
        )}
      </span>
    </FooterTip>
  );
}

export function RepoSelector() {
  const {repository, integratedOrgId, changeContextValue} = useCodecovContext();
  const [searchValue, setSearchValue] = useState<string | undefined>();
  const {data: repositories} = useInfiniteRepositories({term: searchValue});

  const disabled = !integratedOrgId;

  const handleChange = useCallback(
    (selectedOption: SelectOption<string>) => {
      changeContextValue({repository: selectedOption.value});
    },
    [changeContextValue]
  );

  const handleOnSearch = useMemo(
    () =>
      debounce((value: string) => {
        setSearchValue(value);
      }, 500),
    [setSearchValue]
  );

  const options = useMemo((): Array<SelectOption<string>> => {
    // TODO: When API is ready, replace placeholder w/ api response
    const repoSet = new Set([
      ...(repository ? [repository] : []),
      ...(repositories.length > 0 ? repositories.map(item => item.name) : []),
    ]);

    return [...repoSet].map((value): SelectOption<string> => {
      return {
        // TODO: ideally this has a unique id, possibly adjust set to an
        // object when you have backend response
        value,
        label: <OptionLabel>{value}</OptionLabel>,
        textValue: value,
      };
    });
  }, [repository, repositories]);

  useEffect(() => {
    // Create a use effect to cancel handleOnSearch fn on unmount to avoid memory leaks
    return () => {
      handleOnSearch.cancel();
    };
  }, [handleOnSearch]);

  return (
    <CompactSelect
      onSearch={handleOnSearch}
      searchable
      searchPlaceholder={t('search by repository name')}
      options={options}
      value={repository ?? ''}
      onChange={handleChange}
      menuWidth={'16rem'}
      menuBody={<SyncRepoButton />}
      menuFooter={<MenuFooter repoAccessLink="placeholder" />}
      disabled={disabled}
      emptyMessage={
        'No repositories found. Please enter at least 3 characters to search.'
      }
      trigger={(triggerProps, isOpen) => {
        const defaultLabel = options.some(item => item.value === repository)
          ? repository
          : t('Select Repo');

        return (
          <DropdownButton
            isOpen={isOpen}
            data-test-id="page-filter-codecov-repository-selector"
            {...triggerProps}
          >
            <TriggerLabelWrap>
              <Flex align="center" gap={space(0.75)}>
                <IconContainer>
                  <IconRepository />
                </IconContainer>
                <TriggerLabel>{defaultLabel}</TriggerLabel>
              </Flex>
            </TriggerLabelWrap>
          </DropdownButton>
        );
      }}
    />
  );
}

const StyledButton = styled(Button)`
  display: inline-flex;
  text-transform: uppercase;
  color: ${p => p.theme.tokens.content.muted};
  padding: ${space(1)};
  &:hover * {
    background-color: transparent;
    border-color: transparent;
  }
`;

const StyledButtonContainer = styled('div')`
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: ${space(0.5)};
  margin: 0 ${space(0.5)} ${space(0.5)} 0;
`;

const FooterTip = styled('p')`
  display: grid;
  grid-auto-flow: column;
  gap: ${space(0.5)};
  color: ${p => p.theme.subText};
  font-size: ${p => p.theme.fontSize.sm};
  margin: 0;
`;

const TriggerLabelWrap = styled('span')`
  position: relative;
  min-width: 0;
  max-width: 200px;
`;

const TriggerLabel = styled('span')`
  ${p => p.theme.overflowEllipsis}
  width: auto;
`;

const OptionLabel = styled('span')`
  div {
    margin: 0;
  }
`;

const IconContainer = styled('div')`
  flex: 1 0 14px;
  height: 14px;
`;
