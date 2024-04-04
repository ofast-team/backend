import { Request, Response } from 'express'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore'
import { db } from './util'
import { get_verdict } from './judge'
export async function getSubmissions(req: Request, res: Response) {
  const uId: number | string = req.body.uid
  const pIds: string[] = req.body.problemIds
  const isBrief: boolean = req.body.isBrief
  try {
    const allSubmissions: object[] = []

    const add = (submission: object) => {
      return new Promise((resolve, reject) => {
        if (submission !== null) {
          allSubmissions.push(submission)
          resolve(allSubmissions)
        } else {
          reject(new Error('invalid'))
        }
      })
    }

    await Promise.all(
      pIds.map(async (pId) => {
        const submissionList: object[] = []
        const submDb = collection(db, 'Submissions')
        const queries = query(
          submDb,
          where('problem_id', '==', pId),
          where('uid', '==', uId),
        )

        const docs = await getDocs(queries)

        docs.forEach(async (curDoc) => {
          if (curDoc.data().pending) {
            const req: Request = {} as Request
            req.body = { token: curDoc.id }
            const res: Response = {} as Response
            await get_verdict(req, res)
          }

          getDoc(doc(db, 'Submissions', curDoc.id))
            .then((newDoc) => {
              if (newDoc.exists()) curDoc = newDoc
            })
            .catch((err) => {
              res.status(500).json({ error: err })
            })
        })

        docs.forEach((doc) => {
          submissionList.push({
            submission_id: doc.id,
            ...doc.data(),
          })
        })

        const isSubmitted: boolean = submissionList.length > 0
        const isACed: boolean = submissionList.some(
          (submission) => 'verdict' in submission && submission.verdict == 3,
        )

        let problem: object = {
          problemId: pId,
          isSubmitted: isSubmitted,
          isAccepted: isACed,
        }

        if (!isBrief) {
          submissionList.sort((a, b) => {
            const timeA = Object(a)['date']
            const timeB = Object(b)['date']
            if (timeA > timeB) return -1
            else if (timeA == timeB) return 0
            else return 1
          })

          problem = {
            ...problem,
            submissions: submissionList,
          }
        }
        await add(problem)
      }),
    )
    res.status(200).json({ submissionsPerProblem: allSubmissions })
  } catch (err) {
    res.status(500).json({ error: err })
  }
}
