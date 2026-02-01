import React, { useEffect, useMemo, useState } from 'react'
import { useDataEngine, useDataQuery } from '@dhis2/app-runtime'
import {
  Box,
  Button,
  ButtonStrip,
  Field,
  Input,
  Modal,
  ModalActions,
  ModalContent,
  ModalTitle,
  NoticeBox,
  OrganisationUnitTree,
} from '@dhis2/ui'

type OrgUnit = {
  id: string
  displayName: string
  path?: string
}

type TrackedEntity = {
  trackedEntity: string
  trackedEntityType?: string
  orgUnit?: string
  enrollments?: Array<{
    enrollment: string
    program: string
    orgUnit?: string
    status?: string
    occurredAt?: string
    enrolledAt?: string
    events?: Array<{
      event: string
      program?: string
      programStage?: string
      orgUnit?: string
      status?: string
      occurredAt?: string
      scheduledAt?: string
    }>
  }>
}

const rootsQuery = {
  roots: {
    resource: 'organisationUnits',
    params: {
      filter: 'level:eq:1',
      fields: 'id,displayName,path',
    },
  },
}

const trackerFields =
  'trackedEntityType,orgUnit,enrollments[enrollment,program,orgUnit,status,occurredAt,enrolledAt,events[event,program,programStage,orgUnit,status,occurredAt,scheduledAt]]'

type TransferModalProps = {
  initialTeiId?: string
  programId?: string
  currentOrgUnitId?: string
  onClose: () => void
  mode?: 'modal' | 'inline'
}

const UPDATE_ENROLLMENT_ORGUNIT = false
const MIN_SEARCH_LENGTH = 2
const SEARCH_DEBOUNCE_MS = 300

const getValidationMessage = (error: unknown) => {
  if (!error || typeof error !== 'object') {
    return 'Transfer failed.'
  }

  const message = (error as { message?: string }).message
  const responseMessage = (error as { details?: { response?: { data?: { message?: string } } } })
    .details?.response?.data?.message
  if (responseMessage) {
    return responseMessage
  }
  if (message) {
    return message
  }

  return 'Transfer failed.'
}

const useDebouncedValue = (value: string, delay: number) => {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [value, delay])

  return debouncedValue
}

const isUnknownParamError = (error: unknown, paramName: string) => {
  const status = (error as { details?: { response?: { status?: number } } })?.details?.response
    ?.status
  if (!status || status < 400 || status >= 500) {
    return false
  }

  const message = getValidationMessage(error).toLowerCase()
  return (
    message.includes('unknown parameter') ||
    (message.includes('parameter') && message.includes(paramName.toLowerCase()))
  )
}

class TreeErrorBoundary extends React.Component<
  { onError: (message: string) => void; children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { onError: (message: string) => void; children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch() {
    this.props.onError('Failed to render org unit tree. Use manual entry instead.')
  }

  render() {
    if (this.state.hasError) {
      return null
    }
    return this.props.children
  }
}

export const TransferModal: React.FC<TransferModalProps> = ({
  initialTeiId = '',
  programId = '',
  currentOrgUnitId = '',
  onClose,
  mode = 'modal',
}) => {
  const engine = useDataEngine()
  const { data: rootsData } = useDataQuery(rootsQuery)

  const [teiId] = useState(initialTeiId)
  const [selectedPaths, setSelectedPaths] = useState<string[]>([])
  const [selectedOuId, setSelectedOuId] = useState<string | null>(null)
  const [selectedOu, setSelectedOu] = useState<OrgUnit | null>(null)
  const [currentOuId, setCurrentOuId] = useState<string>(currentOrgUnitId)
  const [currentOuName, setCurrentOuName] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [treeError, setTreeError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [searchResults, setSearchResults] = useState<OrgUnit[]>([])
  const [searchError, setSearchError] = useState<string | null>(null)
  const [isSearching, setIsSearching] = useState(false)

  const debouncedSearchText = useDebouncedValue(searchText, SEARCH_DEBOUNCE_MS)

  const roots = useMemo(() => {
    const orgUnits = rootsData?.roots?.organisationUnits
    if (!Array.isArray(orgUnits)) {
      return []
    }
    return orgUnits
      .filter((ou: OrgUnit | null | undefined) => ou && typeof ou.id === 'string')
      .map((ou: OrgUnit) => ou.id)
  }, [rootsData])

  useEffect(() => {
    if (currentOrgUnitId) {
      setCurrentOuId(currentOrgUnitId)
    }
  }, [currentOrgUnitId])

  useEffect(() => {
    if (!teiId || currentOuId) {
      return
    }

    let isActive = true

    const loadCurrentOrgUnit = async () => {
      try {
        const { tei } = await engine.query({
          tei: {
            resource: `tracker/trackedEntities/${teiId}`,
            params: {
              fields: 'orgUnit',
            },
          },
        })

        if (!isActive) {
          return
        }

        const trackedEntity = tei as { orgUnit?: string }
        if (trackedEntity.orgUnit) {
          setCurrentOuId(trackedEntity.orgUnit)
        }
      } catch (error) {
        if (!isActive) {
          return
        }
      }
    }

    loadCurrentOrgUnit()

    return () => {
      isActive = false
    }
  }, [teiId, currentOuId, engine])

  useEffect(() => {
    if (!currentOuId) {
      setCurrentOuName(null)
      return
    }

    let isActive = true

    const loadCurrentOrgUnitName = async () => {
      try {
        const { ou } = await engine.query({
          ou: {
            resource: `organisationUnits/${currentOuId}`,
            params: {
              fields: 'id,displayName',
            },
          },
        })

        if (!isActive) {
          return
        }

        const orgUnit = ou as OrgUnit
        setCurrentOuName(orgUnit.displayName || null)
      } catch (error) {
        if (!isActive) {
          return
        }
        setCurrentOuName(null)
      }
    }

    loadCurrentOrgUnitName()

    return () => {
      isActive = false
    }
  }, [currentOuId, engine])

  useEffect(() => {
    let isActive = true

    const loadOrgUnit = async () => {
      if (!selectedOuId) {
        setSelectedOu(null)
        return
      }

      try {
        const { ou } = await engine.query({
          ou: {
            resource: `organisationUnits/${selectedOuId}`,
            params: {
              fields: 'id,displayName,path',
            },
          },
        })

        if (!isActive) {
          return
        }

        setSelectedOu(ou as OrgUnit)
      } catch (error) {
        if (!isActive) {
          return
        }
        setErrorMessage(getValidationMessage(error))
      }
    }

    loadOrgUnit()

    return () => {
      isActive = false
    }
  }, [selectedOuId, engine])

  useEffect(() => {
    if (mode !== 'inline') {
      return
    }

    window.setTimeout(() => {
      const searchInput = document.querySelector<HTMLInputElement>(
        '[data-test="tei-transfer-search"] input'
      )
      searchInput?.focus()
    }, 0)

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [mode, onClose])

  useEffect(() => {
    const trimmed = debouncedSearchText.trim()
    if (trimmed.length < MIN_SEARCH_LENGTH) {
      setSearchResults([])
      setSearchError(null)
      setIsSearching(false)
      return
    }

    let isActive = true
    setIsSearching(true)
    setSearchError(null)

    const loadSearchResults = async () => {
      try {
        const { orgUnits } = await engine.query({
          orgUnits: {
            resource: 'organisationUnits',
            params: {
              filter: `displayName:ilike:${trimmed}`,
              fields: 'id,displayName',
              paging: true,
              pageSize: 15,
            },
          },
        })

        if (!isActive) {
          return
        }

        const results = orgUnits?.organisationUnits
        if (Array.isArray(results)) {
          setSearchResults(results as OrgUnit[])
        } else {
          setSearchResults([])
        }
      } catch (error) {
        if (!isActive) {
          return
        }
        setSearchError('Failed to search org units.')
        setSearchResults([])
      } finally {
        if (isActive) {
          setIsSearching(false)
        }
      }
    }

    loadSearchResults()

    return () => {
      isActive = false
    }
  }, [debouncedSearchText, engine])

  const descriptionLabel = useMemo(() => {
    if (currentOuName) {
      return currentOuName
    }
    if (currentOuId) {
      return currentOuId
    }
    return 'Unknown org unit'
  }, [currentOuId, currentOuName])

  const destinationOuId = selectedOuId?.trim() ?? ''
  const isSameOrgUnit = Boolean(currentOuId && destinationOuId && currentOuId === destinationOuId)
  const isTransferEnabled = Boolean(
    teiId && programId && destinationOuId && !isSameOrgUnit && !isSubmitting
  )

  const handleTransfer = async () => {
    if (!teiId || !programId || !destinationOuId || isSameOrgUnit) {
      return
    }

    setIsSubmitting(true)
    setStatusMessage(null)
    setErrorMessage(null)

    try {
      const attemptTransfer = async (paramName: 'trackedEntity' | 'trackedEntityInstance') =>
        engine.mutate({
          resource: 'tracker/ownership/transfer',
          type: 'update',
          params: {
            [paramName]: teiId,
            program: programId,
            ou: destinationOuId,
          },
          data: {
            trackedEntity: teiId,
            program: programId,
            orgUnit: destinationOuId,
          },
        })

      try {
        await attemptTransfer('trackedEntity')
      } catch (error) {
        if (isUnknownParamError(error, 'trackedEntity')) {
          await attemptTransfer('trackedEntityInstance')
        } else {
          throw error
        }
      }

      const { tei } = await engine.query({
        tei: {
          resource: `tracker/trackedEntities/${teiId}`,
          params: {
            fields: trackerFields,
          },
        },
      })

      const trackedEntity = tei as TrackedEntity
      const enrollmentToUpdate = trackedEntity.enrollments?.find(
        (enrollment) => enrollment.program === programId
      )

      if (UPDATE_ENROLLMENT_ORGUNIT && enrollmentToUpdate?.enrollment) {
        await engine.mutate({
          resource: 'tracker',
          type: 'create',
          data: {
            enrollments: [
              {
                enrollment: enrollmentToUpdate.enrollment,
                program: programId,
                trackedEntity: trackedEntity.trackedEntity || teiId,
                orgUnit: destinationOuId,
              },
            ],
          },
          params: {
            async: false,
            importStrategy: 'UPDATE',
          },
        })
      }

      const eventsToUpdate =
        enrollmentToUpdate?.events?.map((event) => ({
          event: event.event,
          program: event.program,
          programStage: event.programStage,
          enrollment: enrollmentToUpdate.enrollment,
          orgUnit: destinationOuId,
          status: event.status,
          occurredAt: event.occurredAt,
          scheduledAt: event.scheduledAt,
        })) ?? []

      if (eventsToUpdate.length > 0) {
        await engine.mutate({
          resource: 'tracker',
          type: 'create',
          data: {
            events: eventsToUpdate,
          },
          params: {
            async: false,
            importStrategy: 'UPDATE',
          },
        })
      }

      setStatusMessage('Transfer completed.')
    } catch (error) {
      const message = getValidationMessage(error)
      setErrorMessage(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const content = (
    <Box display="flex" flexDirection="column" gap="16px">
      {!teiId && (
        <NoticeBox warning title="Missing TEI context">
          No tracked entity was provided by Capture. Open this widget from a TEI enrollment.
        </NoticeBox>
      )}

      {!programId && (
        <NoticeBox warning title="Missing program context">
          No program was provided by Capture. Open this widget from a program enrollment.
        </NoticeBox>
      )}

      {isSameOrgUnit && (
        <NoticeBox warning title="Destination org unit unchanged">
          Choose a different org unit to transfer this case.
        </NoticeBox>
      )}

      <Box style={{ fontSize: 14 }}>
        From <strong>{descriptionLabel}</strong> to
      </Box>

      <Field label="Destination Org Unit">
        <Box display="flex" flexDirection="column" gap="8px">
          <Input
            value={searchText}
            onChange={({ value }) => setSearchText(value)}
            placeholder="Search org units"
            dataTest="tei-transfer-search"
          />
          {searchError && (
            <NoticeBox warning title="Search unavailable">
              {searchError}
            </NoticeBox>
          )}
          {isSearching && (
            <Box style={{ fontSize: 12, color: '#556070' }}>Searching...</Box>
          )}
          {debouncedSearchText.trim().length >= MIN_SEARCH_LENGTH &&
            !isSearching &&
            searchResults.length > 0 && (
              <Box
                style={{
                  border: '1px solid #e8edf2',
                  borderRadius: 6,
                  background: '#fff',
                  maxHeight: 160,
                  overflowY: 'auto',
                }}
              >
                {searchResults.map((orgUnit) => (
                  <button
                    key={orgUnit.id}
                    type="button"
                    onClick={() => {
                      setSelectedOuId(orgUnit.id)
                      setSelectedPaths([orgUnit.id])
                      setSearchText(orgUnit.displayName)
                      setSearchResults([])
                    }}
                    style={{
                      width: '100%',
                      padding: '8px',
                      textAlign: 'left',
                      background: 'transparent',
                      border: 'none',
                      borderBottom: '1px solid #f0f3f6',
                      cursor: 'pointer',
                    }}
                  >
                    {orgUnit.displayName}
                  </button>
                ))}
              </Box>
            )}
          {debouncedSearchText.trim().length >= MIN_SEARCH_LENGTH &&
            !isSearching &&
            searchResults.length === 0 && (
              <Box style={{ fontSize: 12, color: '#556070' }}>
                No matching org units.
              </Box>
            )}
        </Box>
        {treeError ? (
          <>
            <NoticeBox warning title="Org unit tree unavailable">
              {treeError}
            </NoticeBox>
            <Box marginTop="12px">
              <Input
                value={selectedOuId ?? ''}
                onChange={({ value }) => setSelectedOuId(value)}
                placeholder="Enter destination org unit UID"
              />
            </Box>
          </>
        ) : roots.length === 0 ? (
          <NoticeBox warning title="Org unit tree unavailable">
            No root org units were loaded. Check your user org unit access.
          </NoticeBox>
        ) : (
          <Box
            padding="8px"
            overflow="auto"
            style={{
              background: '#fff',
              borderRadius: 6,
              border: '1px solid #e8edf2',
              minHeight: 420,
              height: 480,
              flexShrink: 0,
            }}
          >
            <TreeErrorBoundary onError={(message) => setTreeError(message)}>
              <OrganisationUnitTree
                roots={roots}
                selected={selectedPaths}
                singleSelection
                onChange={({ selected, id }: { selected: string[]; id: string }) => {
                  const lastSelected = selected.filter(Boolean).slice(-1)
                  setSelectedPaths(lastSelected)
                  setSelectedOuId(id)
                }}
              />
            </TreeErrorBoundary>
          </Box>
        )}
      </Field>

      {selectedOu && (
        <Field label="Selected Org Unit">
          <Input value={`${selectedOu.displayName} (${selectedOu.id})`} readOnly />
        </Field>
      )}

      {errorMessage && (
        <NoticeBox error title="Transfer failed">
          {errorMessage}
        </NoticeBox>
      )}

      {statusMessage && <NoticeBox title="Success">{statusMessage}</NoticeBox>}
    </Box>
  )

  if (mode === 'inline') {
    return (
      <Box
        padding="16px"
        width="100%"
        maxWidth="100%"
        border="1px solid #e8edf2"
        background="#fff"
        boxShadow="0 1px 3px rgba(0, 0, 0, 0.12)"
        dataTest="tei-transfer-panel"
        style={{
          minHeight: 720,
          height: 720,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <Box marginBottom="12px" style={{ textAlign: 'center' }}>
          <strong>Transfer case</strong>
        </Box>
        <Box style={{ flex: '1 1 auto', minHeight: 0 }}>
          <Box style={{ height: 560, overflow: 'auto' }}>{content}</Box>
        </Box>
        <Box marginTop="16px">
          <ButtonStrip end>
            <Button secondary onClick={onClose}>
              Close
            </Button>
            <Button
              primary
              onClick={handleTransfer}
              disabled={!isTransferEnabled}
              loading={isSubmitting}
            >
              Transfer
            </Button>
          </ButtonStrip>
        </Box>
      </Box>
    )
  }

  return (
    <Modal
      position="middle"
      large
      fluid
      onClose={onClose}
      dataTest="tei-transfer-modal"
    >
      <ModalTitle>Transfer TEI</ModalTitle>
      <ModalContent>{content}</ModalContent>
      <ModalActions>
        <ButtonStrip end>
          <Button secondary onClick={onClose}>
            Close
          </Button>
          <Button
            primary
            onClick={handleTransfer}
            disabled={!isTransferEnabled}
            loading={isSubmitting}
          >
            Transfer
          </Button>
        </ButtonStrip>
      </ModalActions>
    </Modal>
  )
}
