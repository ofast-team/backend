import { Octokit } from '@octokit/rest'
import { Request, Response } from 'express'
import type { Problem } from './Problem'
import { GITHUB_TOKEN } from './githubToken'
import { createTokenAuth } from '@octokit/auth-token'

export async function postProblem(req: Request, res: Response) {
  const githubToken = GITHUB_TOKEN.value()
  const auth = createTokenAuth(githubToken)
  const octokit = new Octokit({
    auth,
  })
  const owner = 'ofast-team'
  const repo = 'problems'
  try {
    const problem: Problem = req.body
    const content = JSON.stringify(problem, null, 2)

    const mainBranch = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: 'heads/main',
    })

    const mainBranchSha = mainBranch.data.object.sha

    const branchName = `problem-${problem.problemID}`
    await octokit.rest.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branchName}`,
      sha: mainBranchSha,
    })

    await octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: `problems/${problem.problemID}.json`,
      message: 'Create problem file',
      content: Buffer.from(content).toString('base64'),
      branch: branchName,
    })

    const response = await octokit.rest.pulls.create({
      owner,
      repo,
      title: 'Automated Pull Request for Problem',
      head: branchName,
      base: 'main',
      body: `Automated Pull Request for Problem #${problem.problemID}`,
    })

    return res.status(200).send({ problemLink: response.data.html_url })
  } catch (error) {
    return res.status(500).send({ error: error })
  }
}
