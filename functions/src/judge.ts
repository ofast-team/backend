import { Request, Response } from 'express'
import { doc, updateDoc, addDoc, getDoc, collection } from 'firebase/firestore'
import {
  DEFAULT_MEMORY_LIMIT,
  DEFAULT_TIME_LIMIT,
  MAX_CASES,
  MAX_MEMORY_LIMIT,
  MAX_TIME_LIMIT,
  MIN_MEMORY_LIMIT,
  db,
  judge_url,
} from './util'
import { Buffer } from 'buffer'
import axios from 'axios'

export async function judge_is_online(_req: Request, res: Response) {
  try {
    const url = judge_url + '/about'
    const judge_res = await axios.get(url)
    if (judge_res.status != 200) {
      return res.status(400).json({ status: 'The judge is not online.' })
    } else {
      const time = new Date()
      const updatedTime = { time: time }
      let response = 500
      await updateDoc(doc(db, 'JudgeData', 'LastOnline'), updatedTime)
        .then(() => {
          response = 200
        })
        .catch(() => {
          response = 500
        })
      return res
        .status(response)
        .json(
          response == 200
            ? { status: 'The judge is online' }
            : { status: 'Internal Server Error' },
        )
    }
  } catch (err) {
    return res.status(500).json({ status: 'Internal Server Error' })
  }
}

/* eslint-disable  @typescript-eslint/no-explicit-any */
async function get_data(problem_id: string): Promise<{
  error: any | undefined
  inputs: string[] | undefined
  outputs: string[] | undefined
}> {
  const inputs: string[] = []
  const outputs: string[] = []
  // get the data from the database
  await getDoc(doc(db, 'ProblemData', problem_id))
    .then((problem) => {
      if (problem.exists()) {
        const data = problem.data().data
        for (let i = 0; i < data.length; i++) {
          inputs.push(Buffer.from(data[i].input).toString('base64'))
          outputs.push(Buffer.from(data[i].output).toString('base64'))
        }
        return {
          inputs: inputs,
          outputs: outputs,
          error: undefined,
        }
      } else {
        return { error: 'Problem does not exist' }
      }
    })
    .catch((err) => {
      return {
        error: err,
        inputs: undefined,
        outputs: undefined,
      }
    })
  return {
    inputs: inputs,
    outputs: outputs,
    error: undefined,
  }
}

export async function get_limits(problem_id: string): Promise<{
  time_limit: number
  memory_limit: number
}> {
  let time_limit = DEFAULT_TIME_LIMIT
  let memory_limit = DEFAULT_MEMORY_LIMIT
  await getDoc(doc(db, 'Problems', problem_id))
    .then((problem) => {
      if (problem.exists()) {
        time_limit = problem.data().timeLimit
        memory_limit = problem.data().memory_limit
      }
      return { time_limit: time_limit, memory_limit: memory_limit }
    })
    .catch(() => {
      return {
        time_limit: DEFAULT_TIME_LIMIT,
        memory_limit: DEFAULT_MEMORY_LIMIT,
      }
    })
  return { time_limit: time_limit, memory_limit: memory_limit }
}

export async function submit(req: Request, res: Response) {
  const url = judge_url + '/submissions/batch?base64_encoded=true'

  const code = req.body.source_code
  let inputs = req.body.inputs
  let outputs = req.body.outputs
  const language_string = req.body.language_id
  const uid = req.body.uid
  let problem_id = req.body.problem_id
  let time_limit = req.body.time_limit
  let memory_limit = req.body.memory_limit

  let error = ''

  const missing: string[] = []
  if (uid == undefined) {
    missing.push('Missing uid')
  }
  if (code == undefined) {
    missing.push('Missing source_code')
  }
  if (language_string == undefined) {
    missing.push('Missing language')
  }

  if (problem_id == undefined) {
    // arbitrary submission

    problem_id = -1

    if (inputs == undefined) {
      missing.push('Missing inputs array')
    }

    if (outputs == undefined) {
      missing.push('Missing outputs array')
    }

    if (missing.length > 0) {
      return res.status(400).json({ error: missing })
    }
  } else {
    // problem submission
    inputs = []
    outputs = []
    const data = await get_data(problem_id)
    inputs = data.inputs
    outputs = data.outputs
    error = data.error
    const limits = await get_limits(problem_id)
    time_limit = limits.time_limit
    memory_limit = limits.memory_limit
  }

  if (error != '' && error != undefined) {
    return res.status(500).json({ error: 'Something went wrong...' })
  }

  if (time_limit == undefined) {
    time_limit = DEFAULT_TIME_LIMIT
  }

  if (memory_limit == undefined) {
    memory_limit = DEFAULT_MEMORY_LIMIT
  }

  await getDoc(doc(db, 'UserData', uid))
    .then(async (user) => {
      if (user.exists()) {
        let language = 0
        if (language_string == 'c') {
          language = 50
        } else if (language_string == 'cpp') {
          language = 54
        } else if (language_string == 'java') {
          language = 62
        } else if (language_string == 'py') {
          language = 71
        } else {
          return res.status(400).json({ error: 'Invalid language' })
        }

        let compiler_flags = ''
        let args = ''

        // TODO: Add time/memory limits

        // C = 50, C++ = 54, Java = 62, Python = 71 (does not use pypy in default judge0)
        if (language == 50) {
          compiler_flags = '-g -O2 -std=c11'
        } else if (language == 54) {
          compiler_flags = '-g -O2 -std=c++17'
        } else if (language == 62) {
          args = '-Xss64m -Xmx2048m'
        }

        const submissions: {
          source_code: string
          stdin: string
          expected_output: string
          language_id: number
          compiler_options: string
          cpu_time_limit: number
          command_line_arguments: string
          memory_limit: number
        }[] = []

        if (inputs.length != outputs.length) {
          return res
            .status(400)
            .json({ error: 'Different number of inputs and outputs.' })
        }

        if (inputs.length == 0 || outputs.length == 0) {
          return res
            .status(400)
            .json({ error: 'No inputs or expected outputs.' })
        }

        if (inputs.length > MAX_CASES || outputs.length > MAX_CASES) {
          return res
            .status(400)
            .json({ error: 'Too many cases (max of ' + MAX_CASES + ')' })
        }

        time_limit = Math.min(MAX_TIME_LIMIT, time_limit)
        memory_limit = Math.min(MAX_MEMORY_LIMIT, memory_limit)
        memory_limit = Math.max(MIN_MEMORY_LIMIT, memory_limit)

        for (let i = 0; i < inputs.length; i++) {
          submissions.push({
            source_code: code,
            stdin: inputs[i],
            expected_output: outputs[i],
            language_id: language,
            compiler_options: compiler_flags,
            command_line_arguments: args,
            cpu_time_limit: time_limit,
            memory_limit: memory_limit * 1000,
          })
        }

        const tokens: string[] = []
        try {
          const judge_res = await axios.post(url, { submissions: submissions })
          if (judge_res.status != 201) {
            return res.status(judge_res.status).json(judge_res.data)
          } else {
            const responses = judge_res.data
            for (let i = 0; i < responses.length; i++) {
              if (responses[i].token != undefined) {
                tokens.push(responses[i].token)
              } else {
                tokens.push('')
              }
            }
          }
        } catch (err) {
          return res.status(500).json({ error: err })
        }
        const date = new Date()
        addDoc(collection(db, 'Submissions'), {
          uid: uid,
          code: code,
          tokens: tokens,
          pending: true,
          date: date,
          problem_id: problem_id,
          total_cases: tokens.length,
          language: language_string,
          verdict: 1,
        })
          .then((id) => {
            return res.status(201).json({ token: id.id })
          })
          .catch((err) => {
            return res.status(500).json({ error: err })
          })
      } else {
        return res.status(404).json({ error: 'User does not exist.' })
      }
      return
    })
    .catch((err) => {
      return { error: err, inputs: undefined, outputs: undefined }
    })
  return
}

export async function get_verdict(req: Request, res: Response) {
  // TODO: After the submission is no longer pending, delete it :)
  const submission_id: string = req.body.token
  await getDoc(doc(db, 'Submissions', submission_id))
    .then(async (submission) => {
      if (submission.exists()) {
        const info = submission.data()
        if (info.pending == true) {
          let token_string = ''
          for (let i = 0; i < info.tokens.length; i++) {
            token_string += info.tokens[i]
            if (i < info.tokens.length - 1) {
              token_string += ','
            }
          }

          const url =
            judge_url +
            '/submissions/batch?tokens=' +
            token_string +
            '&fields=status_id,time,memory'
          const judge_res = await axios.get(url)

          const response_list = judge_res.data.submissions

          let verdict = 0
          const verdict_list: number[] = []
          let time = 0
          let pass_count = 0
          let pending = false
          let memory = 0
          for (let i = 0; i < response_list.length; i++) {
            if (response_list[i].status_id == 3) {
              pass_count++
            }
            if (response_list[i].status_id < 3) {
              pending = true
            }
            verdict = Math.max(verdict, response_list[i].status_id)
            verdict_list.push(response_list[i].status_id)
            time = Math.max(time, response_list[i].time)
            memory = Math.max(memory, response_list[i].memory)
          }

          const new_object = submission.data()
          new_object.verdict = verdict
          new_object.verdict_list = verdict_list
          new_object.time = time
          new_object.passed_cases = pass_count
          new_object.pending = pending
          new_object.memory = memory

          updateDoc(doc(db, 'Submissions', submission_id), new_object)
            .then(() => {
              return res.status(200).json(new_object)
            })
            .catch((err) => {
              return res.status(500).json({ error: err })
            })
          return
        } else {
          return res.status(200).json(info)
        }
      } else {
        return res.status(404).json({ error: 'Submission id not found.' })
      }
    })
    .catch((err) => {
      return res.status(500).json({ error: err })
    })
}
