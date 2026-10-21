"use client";

/**
 * All repos defer GitHub commits until the user clicks「提交到 GitHub」.
 * Local folder mode (`owner === "local"`) saves to disk; others save to the database.
 */
const isDeferredCommitRepoClient = (_owner?: string, _repo?: string) => true;

export { isDeferredCommitRepoClient };
