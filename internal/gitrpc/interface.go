// Copyright 2022 Harness Inc. All rights reserved.
// Use of this source code is governed by the Polyform Free Trial License
// that can be found in the LICENSE.md file for this repository.

package gitrpc

import (
	"context"
	"io"
)

type Interface interface {
	CreateRepository(ctx context.Context, params *CreateRepositoryParams) (*CreateRepositoryOutput, error)
	GetTreeNode(ctx context.Context, params *GetTreeNodeParams) (*GetTreeNodeOutput, error)
	ListTreeNodes(ctx context.Context, params *ListTreeNodeParams) (*ListTreeNodeOutput, error)
	GetSubmodule(ctx context.Context, params *GetSubmoduleParams) (*GetSubmoduleOutput, error)
	GetBlob(ctx context.Context, params *GetBlobParams) (*GetBlobOutput, error)
	ListCommits(ctx context.Context, params *ListCommitsParams) (*ListCommitsOutput, error)
	ListBranches(ctx context.Context, params *ListBranchesParams) (*ListBranchesOutput, error)
	ListCommitTags(ctx context.Context, params *ListCommitTagsParams) (*ListCommitTagsOutput, error)

	/*
	 * HTTP services
	 */
	GetInfoRefs(ctx context.Context, w io.Writer, params *InfoRefsParams) error
	ServicePack(ctx context.Context, w io.Writer, params *ServicePackParams) error
}

// gitAdapter for accessing git commands from gitea.
type gitAdapter interface {
	InitRepository(ctx context.Context, path string, bare bool) error
	SetDefaultBranch(ctx context.Context, repoPath string, defaultBranch string, allowEmpty bool) error
	Clone(ctx context.Context, from, to string, opts cloneRepoOptions) error
	AddFiles(repoPath string, all bool, files ...string) error
	Commit(repoPath string, opts commitChangesOptions) error
	Push(ctx context.Context, repoPath string, opts pushOptions) error
	GetTreeNode(ctx context.Context, repoPath string, ref string, treePath string) (*treeNode, error)
	ListTreeNodes(ctx context.Context, repoPath string, ref string, treePath string,
		recursive bool, includeLatestCommit bool) ([]treeNodeWithCommit, error)
	GetSubmodule(ctx context.Context, repoPath string, ref string, treePath string) (*submodule, error)
	GetBlob(ctx context.Context, repoPath string, sha string, sizeLimit int64) (*blob, error)
	WalkReferences(ctx context.Context, repoPath string, handler walkReferencesHandler, opts *walkReferencesOptions) error
	GetCommit(ctx context.Context, repoPath string, ref string) (*commit, error)
	GetCommits(ctx context.Context, repoPath string, refs []string) ([]commit, error)
	ListCommits(ctx context.Context, repoPath string, ref string, page int, pageSize int) ([]commit, int64, error)
	GetLatestCommit(ctx context.Context, repoPath string, ref string, treePath string) (*commit, error)
	GetAnnotatedTag(ctx context.Context, repoPath string, sha string) (*tag, error)
	GetAnnotatedTags(ctx context.Context, repoPath string, shas []string) ([]tag, error)
}