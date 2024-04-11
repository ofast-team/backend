import { Request, Response } from 'express'
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  verifyPasswordResetCode,
  confirmPasswordReset,
} from 'firebase/auth'
import { auth, db } from './util'
import admin from 'firebase-admin'

import { doc, setDoc } from 'firebase/firestore'

export function emailLogin(req: Request, res: Response): void {
  const user = req.body

  signInWithEmailAndPassword(auth, user.email, user.password)
    .then((data) => {
      const uid = data.user.uid

      admin
        .auth()
        .getUser(uid)
        .then((user) => {
          let isVerified = false
          if (user.emailVerified) isVerified = true
          return res.status(200).json({ userId: uid, isVerified: isVerified })
        })
        .catch((err) => {
          return res.status(500).json({ error: err })
        })
    })
    .catch((err) => {
      if (err.code === 'auth/invalid-login-credentials')
        return res.status(401).json({ general: 'Invalid Credentials' })
      else if (err.code === 'auth/invalid-email')
        return res.status(401).json({ general: 'Invalid Email' })
      else if (err.code === 'auth/missing-email')
        return res.status(401).json({ general: 'Missing Email' })
      else if (err.code === 'auth/missing-password')
        return res.status(401).json({ general: 'Missing Password' })
      else return res.status(500).json({ error: err.code })
    })
}

export function isVerified(req: Request, res: Response): void {
  const uid = req.body.uid
  admin
    .auth()
    .getUser(uid)
    .then((user) => {
      return res.status(200).json({ isVerified: user.emailVerified })
    })
    .catch((err) => {
      return res.status(500).json({ error: err })
    })
}

export function sendVerificationEmail(req: Request, res: Response): void {
  if (auth.currentUser !== null) {
    console.log(auth.currentUser.uid)
    sendEmailVerification(auth.currentUser)
      .then(() => {
        return res.status(200).json({ general: 'Verification Email Sent' })
      })
      .catch((err) => {
        return res.status(500).json({ error: err })
      })
  } else res.status(404).json({ general: 'No User Found' })
}

export function doSendPasswordResetEmail(req: Request, res: Response): void {
  let email = null
  if (req.body.isLoggedIn) email = auth.currentUser?.email
  else email = req.body.email

  sendPasswordResetEmail(auth, email)
    .then(() => {
      return res.status(200).json({ message: 'success' })
    })
    .catch((err) => {
      return res.status(500).json({ error: err })
    })
}

export function emailRegister(req: Request, res: Response): void {
  const newUser = req.body
  createUserWithEmailAndPassword(auth, newUser.email, newUser.password)
    .then((data) => {
      const uid = data.user.uid
      setDoc(doc(db, 'UserData', uid), {})
        .then(() => {
          if (auth.currentUser !== null) {
            sendEmailVerification(auth.currentUser)
              .then(() => {
                return res.status(201).json({ general: 'User Created' })
              })
              .catch((err) => {
                return res.status(500).json({ error: err })
              })
          }
        })
        .catch((err) => {
          return res.status(500).json({ error: err })
        })
    })
    .catch((err) => {
      if (err.code === 'auth/email-already-in-use')
        return res.status(401).json({ general: 'Email in Use' })
      else if (err.code === 'auth/invalid-email')
        return res.status(401).json({ general: 'Invalid Email' })
      else if (err.code === 'auth/missing-email')
        return res.status(401).json({ general: 'Missing Email' })
      else if (err.code === 'auth/missing-password')
        return res.status(401).json({ general: 'Missing Password' })
      else return res.status(500).json({ error: err.code })
    })
}

export function checkResetPassword(req: Request, res: Response): void {
  verifyPasswordResetCode(auth, req.body.oobCode)
    .then(() => {
      return res.status(200).json({ general: 'Valid Code' })
    })
    .catch(() => {
      return res.status(500).json({ general: 'Expired/Invalid Code' })
    })
}

export function doResetPassword(req: Request, res: Response): void {
  confirmPasswordReset(auth, req.body.oobCode, req.body.password)
    .then(() => {
      return res.status(200).json({ general: 'Password has been reset!' })
    })
    .catch((err) => {
      return res.status(500).json({ error: err.code })
    })
}
