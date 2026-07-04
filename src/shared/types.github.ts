export interface GitHubUser {
  login: string;
  name: string | null;
  avatarUrl: string;
}

export interface GithubInvoke {
  "github:auth-start": { args: void; result: { userCode: string; verificationUri: string } };
  "github:auth-poll": { args: void; result: GitHubUser };
  "github:auth-status": { args: void; result: GitHubUser | null };
  "github:auth-disconnect": { args: void; result: void };
}
