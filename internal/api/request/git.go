// Copyright 2022 Harness Inc. All rights reserved.
// Use of this source code is governed by the Polyform Free Trial License
// that can be found in the LICENSE.md file for this repository.

package request

import (
	"net/http"

	"github.com/harness/gitness/types"
	"github.com/harness/gitness/types/enum"
)

const (
	QueryParamGitRef        = "git_ref"
	QueryParamIncludeCommit = "include_commit"
)

func GetGitRefFromQueryOrDefault(r *http.Request, deflt string) string {
	return QueryParamOrDefault(r, QueryParamGitRef, deflt)
}

func GetIncludeCommitFromQueryOrDefault(r *http.Request, deflt bool) (bool, error) {
	return QueryParamAsBoolOrDefault(r, QueryParamIncludeCommit, deflt)
}

// ParseSortBranch extracts the branch sort parameter from the url.
func ParseSortBranch(r *http.Request) enum.BranchSortOption {
	return enum.ParseBranchSortOption(
		r.FormValue(QueryParamSort),
	)
}

// ParseBranchFilter extracts the branch filter from the url.
func ParseBranchFilter(r *http.Request) *types.BranchFilter {
	return &types.BranchFilter{
		Query: ParseQuery(r),
		Sort:  ParseSortBranch(r),
		Order: ParseOrder(r),
		Page:  ParsePage(r),
		Size:  ParseLimit(r),
	}
}

// ParseSortTag extracts the tag sort parameter from the url.
func ParseSortTag(r *http.Request) enum.TagSortOption {
	return enum.ParseTagSortOption(
		r.FormValue(QueryParamSort),
	)
}

// ParseTagFilter extracts the tag filter from the url.
func ParseTagFilter(r *http.Request) *types.TagFilter {
	return &types.TagFilter{
		Query: ParseQuery(r),
		Sort:  ParseSortTag(r),
		Order: ParseOrder(r),
		Page:  ParsePage(r),
		Size:  ParseLimit(r),
	}
}

// ParseCommitFilter extracts the commit filter from the url.
func ParseCommitFilter(r *http.Request) *types.CommitFilter {
	return &types.CommitFilter{
		After: QueryParamOrDefault(r, QueryParamAfter, ""),
		Page:  ParsePage(r),
		Limit: ParseLimit(r),
	}
}
