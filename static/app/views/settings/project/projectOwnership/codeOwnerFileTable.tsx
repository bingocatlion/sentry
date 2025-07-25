import {Fragment} from 'react';
import {useTheme} from '@emotion/react';
import styled from '@emotion/styled';

import {addErrorMessage, addSuccessMessage} from 'sentry/actionCreators/indicator';
import {openModal} from 'sentry/actionCreators/modal';
import {Flex} from 'sentry/components/core/layout';
import {ExternalLink} from 'sentry/components/core/link';
import {DropdownMenu} from 'sentry/components/dropdownMenu';
import {PanelTable} from 'sentry/components/panels/panelTable';
import TimeSince from 'sentry/components/timeSince';
import {IconEllipsis, IconOpen} from 'sentry/icons';
import {t} from 'sentry/locale';
import {space} from 'sentry/styles/space';
import type {CodeOwner, CodeownersFile} from 'sentry/types/integrations';
import type {Project} from 'sentry/types/project';
import {getCodeOwnerIcon} from 'sentry/utils/integrationUtil';
import useApi from 'sentry/utils/useApi';
import useOrganization from 'sentry/utils/useOrganization';

import ViewCodeOwnerModal, {modalCss} from './viewCodeOwnerModal';

interface CodeOwnerFileTableProps {
  codeowners: CodeOwner[];
  disabled: boolean;
  onDelete: (data: CodeOwner) => void;
  onUpdate: (data: CodeOwner) => void;
  project: Project;
}

/**
 * A list of codeowner files being used for this project
 * If you're looking for ownership rules table see `OwnershipRulesTable`
 */
export function CodeOwnerFileTable({
  codeowners,
  project,
  onUpdate,
  onDelete,
  disabled,
}: CodeOwnerFileTableProps) {
  const api = useApi();
  const theme = useTheme();
  const organization = useOrganization();

  // Do we need an empty state instead?
  if (codeowners.length === 0) {
    return null;
  }

  const handleView = (codeowner: CodeOwner) => () => {
    // Open modal with codeowner file
    openModal(deps => <ViewCodeOwnerModal {...deps} codeowner={codeowner} />, {
      modalCss: modalCss(theme),
    });
  };

  const handleSync = (codeowner: CodeOwner) => async () => {
    try {
      const codeownerFile: CodeownersFile = await api.requestPromise(
        `/organizations/${organization.slug}/code-mappings/${codeowner.codeMappingId}/codeowners/`,
        {
          method: 'GET',
        }
      );

      const data = await api.requestPromise(
        `/projects/${organization.slug}/${project.slug}/codeowners/${codeowner.id}/`,
        {
          method: 'PUT',
          data: {raw: codeownerFile.raw, date_updated: new Date().toISOString()},
        }
      );
      onUpdate({...codeowner, ...data});
      addSuccessMessage(t('CODEOWNERS file sync successful.'));
    } catch (_err) {
      addErrorMessage(t('An error occurred trying to sync CODEOWNERS file.'));
    }
  };

  const handleDelete = (codeowner: CodeOwner) => async () => {
    try {
      await api.requestPromise(
        `/projects/${organization.slug}/${project.slug}/codeowners/${codeowner.id}/`,
        {
          method: 'DELETE',
        }
      );
      onDelete(codeowner);
      addSuccessMessage(t('Deletion successful'));
    } catch {
      // no 4xx errors should happen on delete
      addErrorMessage(t('An error occurred'));
    }
  };

  return (
    <StyledPanelTable
      headers={[
        t('codeowners'),
        t('Stack Trace Root'),
        t('Source Code Root'),
        t('Last Synced'),
        t('File'),
        '',
      ]}
    >
      {codeowners.map(codeowner => (
        <Fragment key={codeowner.id}>
          <Flex align="center" gap={space(1)}>
            {getCodeOwnerIcon(codeowner.provider)}
            {codeowner.codeMapping?.repoName}
          </Flex>
          <Flex align="center" gap={space(1)}>
            <code>{codeowner.codeMapping?.stackRoot}</code>
          </Flex>
          <Flex align="center" gap={space(1)}>
            <code>{codeowner.codeMapping?.sourceRoot}</code>
          </Flex>
          <Flex align="center" gap={space(1)}>
            <TimeSince date={codeowner.dateUpdated} />
          </Flex>
          <Flex align="center" gap={space(1)}>
            {codeowner.codeOwnersUrl === 'unknown' ? null : (
              <StyledExternalLink href={codeowner.codeOwnersUrl}>
                <IconOpen size="xs" />
                {t(
                  'View in %s',
                  codeowner.codeMapping?.provider?.name ?? codeowner.provider
                )}
              </StyledExternalLink>
            )}
          </Flex>
          <Flex align="center" gap={space(1)}>
            <DropdownMenu
              items={[
                {
                  key: 'view',
                  label: t('View'),
                  onAction: handleView(codeowner),
                },
                {
                  key: 'sync',
                  label: t('Sync'),
                  onAction: handleSync(codeowner),
                },
                {
                  key: 'delete',
                  label: t('Delete'),
                  priority: 'danger',
                  onAction: handleDelete(codeowner),
                },
              ]}
              position="bottom-end"
              triggerProps={{
                'aria-label': t('Actions'),
                size: 'xs',
                icon: <IconEllipsis />,
                showChevron: false,
                disabled,
              }}
              disabledKeys={disabled ? ['sync', 'delete'] : []}
            />
          </Flex>
        </Fragment>
      ))}
    </StyledPanelTable>
  );
}

const StyledPanelTable = styled(PanelTable)`
  grid-template-columns: 1fr 1fr 1fr auto min-content min-content;
  position: static;
  overflow: auto;
  white-space: nowrap;
`;

const StyledExternalLink = styled(ExternalLink)`
  display: flex;
  align-items: center;
  gap: ${space(1)};
`;
