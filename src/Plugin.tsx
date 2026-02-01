import React, { useMemo, useState } from 'react'
import { Box, Button } from '@dhis2/ui'
import { TransferModal } from './components/TransferModal'
import './Plugin.css'

type PluginProps = {
  trackedEntityId?: string
  teiId?: string
  trackedEntity?: { id?: string }
  programId?: string
  program?: { id?: string }
  enrollment?: { orgUnit?: string; program?: string }
  orgUnitId?: string
}

const resolveTeiId = (props: PluginProps) =>
  props.trackedEntityId || props.teiId || props.trackedEntity?.id || ''

const Plugin: React.FC<PluginProps> = (props) => {
  const initialTeiId = useMemo(() => resolveTeiId(props), [props])
  const [panelOpen, setPanelOpen] = useState(false)

  const handleClose = () => {
    setPanelOpen(false)
    window.setTimeout(() => {
      const triggerButton = document.querySelector<HTMLButtonElement>(
        '[data-test="tei-transfer-trigger"] button'
      )
      triggerButton?.focus()
    }, 0)
  }

  const resolvedProgramId =
    props.programId || props.program?.id || props.enrollment?.program || ''
  const resolvedOrgUnitId = props.orgUnitId || props.enrollment?.orgUnit || ''

  return (
    <Box>
      {!panelOpen && (
        <Box className="tei-transfer-trigger-container">
          <Button primary onClick={() => setPanelOpen(true)} dataTest="tei-transfer-trigger">
            TRANSFER CASE
          </Button>
        </Box>
      )}
      {panelOpen && (
        <Box marginTop="12px">
          <TransferModal
            initialTeiId={initialTeiId}
            programId={resolvedProgramId}
            currentOrgUnitId={resolvedOrgUnitId}
            onClose={handleClose}
            mode="inline"
          />
        </Box>
      )}
    </Box>
  )
}

export default Plugin
