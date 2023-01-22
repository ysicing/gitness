// Copyright 2022 Harness Inc. All rights reserved.
// Use of this source code is governed by the Polyform Free Trial License
// that can be found in the LICENSE.md file for this repository.

package service

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/harness/gitness/gitrpc/internal/tempdir"
	"github.com/harness/gitness/gitrpc/internal/types"
	"github.com/harness/gitness/gitrpc/rpc"

	"code.gitea.io/gitea/modules/git"
)

type MergeService struct {
	rpc.UnimplementedMergeServiceServer
	adapter      GitAdapter
	reposRoot    string
	reposTempDir string
}

var _ rpc.MergeServiceServer = (*MergeService)(nil)

func NewMergeService(adapter GitAdapter, reposRoot, reposTempDir string) (*MergeService, error) {
	return &MergeService{
		adapter:      adapter,
		reposRoot:    reposRoot,
		reposTempDir: reposTempDir,
	}, nil
}

//nolint:funlen // needs refactor when all merge methods are implemented
func (s MergeService) MergeBranch(
	ctx context.Context,
	request *rpc.MergeBranchRequest,
) (*rpc.MergeBranchResponse, error) {
	if err := validateMergeBranchRequest(request); err != nil {
		return nil, err
	}

	repoPath := getFullPathForRepo(s.reposRoot, request.GetBase().GetRepoUid())
	pr := &types.PullRequest{
		BaseRepoPath: repoPath,
		BaseBranch:   request.GetBaseBranch(),
		HeadBranch:   request.GetHeadBranch(),
	}
	// Clone base repo.
	tmpBasePath, err := s.adapter.CreateTemporaryRepoForPR(ctx, s.reposTempDir, pr)
	if err != nil {
		return nil, err
	}
	defer func() {
		_ = tempdir.RemoveTemporaryPath(tmpBasePath)
	}()

	var outbuf, errbuf strings.Builder

	baseBranch := "base"
	trackingBranch := "tracking"

	// Enable sparse-checkout
	sparseCheckoutList, err := s.adapter.GetDiffTree(ctx, tmpBasePath, baseBranch, trackingBranch)
	if err != nil {
		return nil, fmt.Errorf("getDiffTree: %w", err)
	}

	infoPath := filepath.Join(tmpBasePath, ".git", "info")
	if err = os.MkdirAll(infoPath, 0o700); err != nil {
		return nil, fmt.Errorf("unable to create .git/info in tmpBasePath: %w", err)
	}

	sparseCheckoutListPath := filepath.Join(infoPath, "sparse-checkout")
	if err = os.WriteFile(sparseCheckoutListPath, []byte(sparseCheckoutList), 0o600); err != nil {
		return nil, fmt.Errorf("unable to write .git/info/sparse-checkout file in tmpBasePath: %w", err)
	}

	// Switch off LFS process (set required, clean and smudge here also)
	if err = s.adapter.Config(ctx, tmpBasePath, "filter.lfs.process", ""); err != nil {
		return nil, err
	}

	if err = s.adapter.Config(ctx, tmpBasePath, "filter.lfs.required", "false"); err != nil {
		return nil, err
	}

	if err = s.adapter.Config(ctx, tmpBasePath, "filter.lfs.clean", ""); err != nil {
		return nil, err
	}

	if err = s.adapter.Config(ctx, tmpBasePath, "filter.lfs.smudge", ""); err != nil {
		return nil, err
	}

	if err = s.adapter.Config(ctx, tmpBasePath, "core.sparseCheckout", "true"); err != nil {
		return nil, err
	}

	// Read base branch index
	if err = s.adapter.ReadTree(ctx, tmpBasePath, "HEAD", io.Discard); err != nil {
		return nil, err
	}
	outbuf.Reset()
	errbuf.Reset()

	sig := &git.Signature{
		Name:  request.GetBase().GetActor().GetName(),
		Email: request.GetBase().GetActor().GetEmail(),
	}
	committer := sig
	commitTimeStr := time.Now().Format(time.RFC3339)

	// Because this may call hooks we should pass in the environment
	env := append(CreateEnvironmentForPush(ctx, request.GetBase()),
		"GIT_AUTHOR_NAME="+sig.Name,
		"GIT_AUTHOR_EMAIL="+sig.Email,
		"GIT_AUTHOR_DATE="+commitTimeStr,
		"GIT_COMMITTER_NAME="+committer.Name,
		"GIT_COMMITTER_EMAIL="+committer.Email,
		"GIT_COMMITTER_DATE="+commitTimeStr,
	)

	mergeMsg := strings.TrimSpace(request.GetTitle())
	if len(request.GetMessage()) > 0 {
		mergeMsg += "\n\n" + strings.TrimSpace(request.GetMessage())
	}

	// no error check needed, all branches are created on fly as ref to remote ones
	baseCommitSHA, _, _ := s.adapter.GetMergeBase(ctx, tmpBasePath, "origin", baseBranch, trackingBranch)
	headCommit, _ := s.adapter.GetCommit(ctx, tmpBasePath, trackingBranch)
	headCommitSHA := headCommit.SHA

	if err = s.adapter.Merge(ctx, pr, "merge", trackingBranch, tmpBasePath, mergeMsg, env); err != nil {
		return nil, err
	}

	mergeCommitSHA, err := s.adapter.GetFullCommitID(ctx, tmpBasePath, baseBranch)
	if err != nil {
		return nil, fmt.Errorf("failed to get full commit id for the new merge: %w", err)
	}

	if err = s.adapter.Push(ctx, tmpBasePath, types.PushOptions{
		Remote: "origin",
		Branch: baseBranch + ":" + git.BranchPrefix + pr.BaseBranch,
		Force:  request.Force,
		Env:    env,
	}); err != nil {
		return nil, err
	}

	return &rpc.MergeBranchResponse{
		MergeSha: mergeCommitSHA,
		BaseSha:  baseCommitSHA,
		HeadSha:  headCommitSHA,
	}, nil
}

func validateMergeBranchRequest(request *rpc.MergeBranchRequest) error {
	base := request.GetBase()
	if base == nil {
		return types.ErrBaseCannotBeEmpty
	}

	author := base.GetActor()
	if author == nil {
		return fmt.Errorf("empty user")
	}

	if len(author.Email) == 0 {
		return fmt.Errorf("empty user email")
	}

	if len(author.Name) == 0 {
		return fmt.Errorf("empty user name")
	}

	if len(request.BaseBranch) == 0 {
		return fmt.Errorf("empty branch name")
	}

	if request.HeadBranch == "" {
		return fmt.Errorf("empty head branch name")
	}

	return nil
}