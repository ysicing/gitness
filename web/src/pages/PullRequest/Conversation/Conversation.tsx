import React, { useMemo, useState } from 'react'
import {
  Avatar,
  Color,
  Container,
  FlexExpander,
  FontVariation,
  Icon,
  Layout,
  StringSubstitute,
  Text,
  useToaster
} from '@harness/uicore'
import { useGet, useMutate } from 'restful-react'
import ReactTimeago from 'react-timeago'
import { CodeIcon, GitInfoProps } from 'utils/GitUtils'
import { MarkdownViewer } from 'components/SourceCodeViewer/SourceCodeViewer'
import { useStrings } from 'framework/strings'
import { useAppContext } from 'AppContext'
import type { TypesPullReqActivity } from 'services/code'
import { CommentAction, CommentBox, CommentBoxOutletPosition, CommentItem } from 'components/CommentBox/CommentBox'
import { PipeSeparator } from 'components/PipeSeparator/PipeSeparator'
import { OptionsMenuButton } from 'components/OptionsMenuButton/OptionsMenuButton'
import { MarkdownEditorWithPreview } from 'components/MarkdownEditorWithPreview/MarkdownEditorWithPreview'
import { useConfirmAct } from 'hooks/useConfirmAction'
import { getErrorMessage } from 'utils/Utils'
import {
  activityToCommentItem,
  CommentType,
  PullRequestCodeCommentPayload
} from 'components/DiffViewer/DiffViewerUtils'
import { PullRequestTabContentWrapper } from '../PullRequestTabContentWrapper'
import { PullRequestStatusInfo } from './PullRequestStatusInfo/PullRequestStatusInfo'
import css from './Conversation.module.scss'

interface ConversationProps extends Pick<GitInfoProps, 'repoMetadata' | 'pullRequestMetadata'> {
  refreshPullRequestMetadata: () => void
}

export const Conversation: React.FC<ConversationProps> = ({
  repoMetadata,
  pullRequestMetadata,
  refreshPullRequestMetadata
}) => {
  const { getString } = useStrings()
  const { currentUser } = useAppContext()
  const {
    data: activities,
    loading,
    error,
    refetch: refetchActivities
  } = useGet<TypesPullReqActivity[]>({
    path: `/api/v1/repos/${repoMetadata.path}/+/pullreq/${pullRequestMetadata.number}/activities`
  })
  const { showError } = useToaster()
  const [newComments, setNewComments] = useState<TypesPullReqActivity[]>([])
  const commentThreads = useMemo(() => {
    const threads: Record<number, CommentItem<TypesPullReqActivity>[]> = {}

    activities?.forEach(activity => {
      const thread: CommentItem<TypesPullReqActivity> = activityToCommentItem(activity)

      if (activity.parent_id) {
        threads[activity.parent_id].push(thread)
      } else {
        threads[activity.id as number] = threads[activity.id as number] || []
        threads[activity.id as number].push(thread)
      }
    })

    newComments.forEach(newComment => {
      threads[newComment.id as number] = [activityToCommentItem(newComment)]
    })

    return threads
  }, [activities, newComments])
  const path = useMemo(
    () => `/api/v1/repos/${repoMetadata.path}/+/pullreq/${pullRequestMetadata.number}/comments`,
    [repoMetadata.path, pullRequestMetadata.number]
  )
  const { mutate: saveComment } = useMutate({ verb: 'POST', path })
  const { mutate: updateComment } = useMutate({ verb: 'PATCH', path: ({ id }) => `${path}/${id}` })
  const { mutate: deleteComment } = useMutate({ verb: 'DELETE', path: ({ id }) => `${path}/${id}` })
  const confirmAct = useConfirmAct()

  return (
    <PullRequestTabContentWrapper loading={loading} error={error} onRetry={refetchActivities}>
      <Container>
        <Layout.Vertical spacing="xlarge">
          <PullRequestStatusInfo
            repoMetadata={repoMetadata}
            pullRequestMetadata={pullRequestMetadata}
            onMerge={() => {
              refreshPullRequestMetadata()
              refetchActivities()
            }}
          />
          <Container>
            <Layout.Vertical spacing="xlarge">
              <DescriptionBox
                repoMetadata={repoMetadata}
                pullRequestMetadata={pullRequestMetadata}
                refreshPullRequestMetadata={refreshPullRequestMetadata}
              />

              {Object.entries(commentThreads).map(([threadId, commentItems]) => {
                if (isSystemComment(commentItems)) {
                  return (
                    <SystemBox key={threadId} pullRequestMetadata={pullRequestMetadata} commentItems={commentItems} />
                  )
                }

                return (
                  <CommentBox
                    key={threadId}
                    fluid
                    getString={getString}
                    commentItems={commentItems}
                    currentUserName={currentUser.display_name}
                    handleAction={async (action, value, commentItem) => {
                      let result = true
                      let updatedItem: CommentItem<TypesPullReqActivity> | undefined = undefined
                      const id = (commentItem as CommentItem<TypesPullReqActivity>)?.payload?.id

                      switch (action) {
                        case CommentAction.DELETE:
                          result = false
                          await confirmAct({
                            message: getString('deleteCommentConfirm'),
                            action: async () => {
                              await deleteComment({}, { pathParams: { id } })
                                .then(() => {
                                  result = true
                                })
                                .catch(exception => {
                                  result = false
                                  showError(getErrorMessage(exception), 0, getString('pr.failedToDeleteComment'))
                                })
                            }
                          })
                          break

                        case CommentAction.REPLY:
                          await saveComment({ text: value, parent_id: Number(threadId) })
                            .then(newComment => {
                              updatedItem = activityToCommentItem(newComment)
                            })
                            .catch(exception => {
                              result = false
                              showError(getErrorMessage(exception), 0, getString('pr.failedToSaveComment'))
                            })
                          break

                        case CommentAction.UPDATE:
                          await updateComment({ text: value }, { pathParams: { id } })
                            .then(newComment => {
                              updatedItem = activityToCommentItem(newComment)
                            })
                            .catch(exception => {
                              result = false
                              showError(getErrorMessage(exception), 0, getString('pr.failedToSaveComment'))
                            })
                          break
                      }

                      return [result, updatedItem]
                    }}
                    outlets={{
                      [CommentBoxOutletPosition.TOP_OF_FIRST_COMMENT]: <CodeCommentHeader commentItems={commentItems} />
                    }}
                  />
                )
              })}

              <CommentBox
                fluid
                getString={getString}
                commentItems={[]}
                currentUserName={currentUser.display_name}
                resetOnSave
                hideCancel
                handleAction={async (_action, value) => {
                  let result = true
                  let updatedItem: CommentItem<TypesPullReqActivity> | undefined = undefined

                  await saveComment({ text: value })
                    .then((newComment: TypesPullReqActivity) => {
                      updatedItem = activityToCommentItem(newComment)
                      setNewComments([...newComments, newComment])
                    })
                    .catch(exception => {
                      result = false
                      showError(getErrorMessage(exception), 0, getString('pr.failedToSaveComment'))
                    })
                  return [result, updatedItem]
                }}
              />
            </Layout.Vertical>
          </Container>
        </Layout.Vertical>
      </Container>
    </PullRequestTabContentWrapper>
  )
}

const DescriptionBox: React.FC<ConversationProps> = ({
  repoMetadata,
  pullRequestMetadata,
  refreshPullRequestMetadata
}) => {
  const [edit, setEdit] = useState(false)
  const [updated, setUpdated] = useState(pullRequestMetadata.edited as number)
  const [originalContent, setOriginalContent] = useState(pullRequestMetadata.description as string)
  const [content, setContent] = useState(originalContent)
  const { getString } = useStrings()
  const { showError } = useToaster()
  const { mutate } = useMutate({
    verb: 'PATCH',
    path: `/api/v1/repos/${repoMetadata.path}/+/pullreq/${pullRequestMetadata.number}`
  })
  const name = pullRequestMetadata.author?.display_name

  return (
    <Container className={css.box}>
      <Layout.Vertical spacing="medium">
        <Container>
          <Layout.Horizontal spacing="small" style={{ alignItems: 'center' }}>
            <Avatar name={name} size="small" hoverCard={false} />
            <Text inline>
              <strong>{name}</strong>
            </Text>
            <PipeSeparator height={8} />
            <Text inline font={{ variation: FontVariation.SMALL }} color={Color.GREY_400}>
              <ReactTimeago date={updated} />
            </Text>
            <FlexExpander />
            <OptionsMenuButton
              isDark={false}
              icon="Options"
              iconProps={{ size: 14 }}
              style={{ padding: '5px' }}
              items={[
                {
                  text: getString('edit'),
                  onClick: () => setEdit(true)
                }
              ]}
            />
          </Layout.Horizontal>
        </Container>
        <Container padding={{ left: 'small', bottom: 'small' }}>
          {(edit && (
            <MarkdownEditorWithPreview
              value={content}
              onSave={value => {
                mutate({
                  title: pullRequestMetadata.title,
                  description: value
                })
                  .then(() => {
                    setContent(value)
                    setOriginalContent(value)
                    setEdit(false)
                    setUpdated(Date.now())
                    refreshPullRequestMetadata()
                  })
                  .catch(exception => showError(getErrorMessage(exception), 0, getString('pr.failedToUpdate')))
              }}
              onCancel={() => {
                setContent(originalContent)
                setEdit(false)
              }}
              i18n={{
                placeHolder: getString('pr.enterDesc'),
                tabEdit: getString('write'),
                tabPreview: getString('preview'),
                save: getString('save'),
                cancel: getString('cancel')
              }}
              maxEditorHeight="400px"
            />
          )) || <MarkdownViewer source={content} />}
        </Container>
      </Layout.Vertical>
    </Container>
  )
}

function isCodeComment(commentItems: CommentItem<TypesPullReqActivity>[]) {
  return commentItems[0]?.payload?.payload?.type === CommentType.CODE_COMMENT
}

interface CodeCommentHeaderProps {
  commentItems: CommentItem<TypesPullReqActivity>[]
}

const CodeCommentHeader: React.FC<CodeCommentHeaderProps> = ({ commentItems }) => {
  if (isCodeComment(commentItems)) {
    const payload = commentItems[0]?.payload?.payload as PullRequestCodeCommentPayload

    return (
      <Container className={css.snapshot}>
        <Layout.Vertical>
          <Container className={css.title}>
            <Text inline className={css.fname}>
              {payload?.file_title || ''}
            </Text>
          </Container>
          <Container className={css.snapshotContent}>
            <Container className="d2h-wrapper">
              <Container className="d2h-file-wrapper line-by-line-file-diff">
                <Container className="d2h-file-diff">
                  <Container className="d2h-code-wrapper">
                    <table className="d2h-diff-table" cellPadding="0px" cellSpacing="0px">
                      <tbody
                        className="d2h-diff-tbody"
                        dangerouslySetInnerHTML={{
                          __html: payload?.diff_html_snapshot || ''
                        }}></tbody>
                    </table>
                  </Container>
                </Container>
              </Container>
            </Container>
          </Container>
        </Layout.Vertical>
      </Container>
    )
  }
  return null
}

function isSystemComment(commentItems: CommentItem<TypesPullReqActivity>[]) {
  return commentItems.length === 1 && commentItems[0].payload?.kind === 'system'
}

interface SystemBoxProps extends Pick<GitInfoProps, 'pullRequestMetadata'> {
  commentItems: CommentItem<TypesPullReqActivity>[]
}

const SystemBox: React.FC<SystemBoxProps> = ({ pullRequestMetadata, commentItems }) => {
  const { getString } = useStrings()
  const type = commentItems[0].payload?.type

  switch (type) {
    case CommentType.MERGE: {
      return (
        <Text className={css.box}>
          <Icon name={CodeIcon.PullRequest} color={Color.PURPLE_700} padding={{ right: 'small' }} />
          <StringSubstitute
            str={getString('pr.prMergedInfo')}
            vars={{
              user: <strong>{pullRequestMetadata.merger?.display_name}</strong>,
              source: <strong>{pullRequestMetadata.source_branch}</strong>,
              target: <strong>{pullRequestMetadata.target_branch} </strong>,
              time: <ReactTimeago date={pullRequestMetadata.merged as number} />
            }}
          />
        </Text>
      )
    }
    default: {
      // eslint-disable-next-line no-console
      console.warn('Unable to render system type activity', commentItems)
      return (
        <Text className={css.box}>
          <Icon name={CodeIcon.Commit} padding={{ right: 'small' }} />
          {type}
        </Text>
      )
    }
  }
}