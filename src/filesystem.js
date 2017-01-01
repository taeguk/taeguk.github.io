const path = require('path').posix
const {S3Client, ListObjectsV2Command, HeadObjectCommand, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, CopyObjectCommand} = require('@aws-sdk/client-s3');
const {CognitoIdentityClient} = require("@aws-sdk/client-cognito-identity");
const {fromCognitoIdentityPool} = require("@aws-sdk/credential-provider-cognito-identity");

const cognitoIdentityClient = new CognitoIdentityClient({
  region: 'ap-northeast-2'
});

const s3 = new S3Client({
  region: 'ap-northeast-2',
  credentials: fromCognitoIdentityPool({
    client: cognitoIdentityClient,
    identityPoolId: 'ap-northeast-2:6fafadd5-4e84-4213-83a4-8b8e5bf7aef2'
  }),
});

const s3BucketName = 'taeguk-github-io-public'

// NOTE: There is no trailing slash in return value.
function getAbsoluteCurrentPath () {
  return $('.current_location').first().text().trim()
}

function setAbsolueCurrentPath (absCurPath) {
  // remove trailing slash except foremost slash
  absCurPath = absCurPath.trim()
  absCurPath = absCurPath === '/' ? '/' : absCurPath.replace(/\/$/, "")
  $('.current_location').text(absCurPath)
}

function getAbsolutePath (path_) {
  const absCurPath = getAbsoluteCurrentPath()
  let absPath

  if (path_.startsWith('/'))
    absPath = path_
  else
    absPath = absCurPath + '/' + path_

  absPath = path.normalize(absPath)
  return absPath
}

exports.cd = async (dirPath) => {
  let absDirPath = getAbsolutePath(dirPath)
  const isDirExists = await checkDirExists(absDirPath)

  if (isDirExists)
    setAbsolueCurrentPath(absDirPath)
  else {
    const isFileExists = await checkFileExists(absDirPath)

    if (isFileExists)
      throw new Error('not a directory: ' + dirPath)
    else
      throw new Error('no such file or directory: ' + dirPath)
  }
}

exports.autoCompleteDir = async (keyword) => {
  const absCurPath = getAbsoluteCurrentPath()

  // First, try to find matched directory in childs.
  let prefix = getDirKeyForS3(absCurPath + '/' + keyword)
  let data = await listObjectsFromS3(prefix)

  // If not found, try to matched directory in siblings.
  if (data.CommonPrefixes.length === 0) {
    // Remove trailing slash.
    prefix = prefix.replace(/\/$/, "")
    data = await listObjectsFromS3(prefix)
  }

  if (data.CommonPrefixes.length > 0)
    return path.relative(absCurPath, data.CommonPrefixes[0].Prefix) + '/'
  else
    return keyword
}

exports.autoCompleteFile = async (keyword) => {
  const absCurPath = getAbsoluteCurrentPath()
  const prefix = getFileKeyForS3(absCurPath + '/' + keyword)
  const data = await listObjectsFromS3(prefix)

  if (data.Contents.length > 0)
    return path.relative(absCurPath, data.Contents[0].Key)
  else if (data.CommonPrefixes.length > 0)
    return path.relative(absCurPath, data.CommonPrefixes[0].Prefix) + '/'
  else
    return keyword
}

async function checkDirExists (absPath) {
  const { isDirExists, _ } = await checkDirExistsAndEmpty(absPath)
  return isDirExists
}

async function checkDirExistsAndEmpty (absPath) {
  const dirData = await listObjectsOfDirFromS3(absPath, excludeDirFromContents = false)
  const isDirExists = dirData.CommonPrefixes.length > 0 || dirData.Contents.length > 0
  const isDirExistsAndEmpty = dirData.CommonPrefixes.length === 0 && dirData.Contents.length === 1
  return { isDirExists, isDirExistsAndEmpty }
}

async function checkFileExists (absPath) {
  if (absPath.substr(-1) === '/')
    return false

  const fileKey = getFileKeyForS3(absPath)
  let isFileExists

  try {
    await s3.send(new HeadObjectCommand({Bucket: s3BucketName, Delimiter: '/', Key: fileKey}))
    isFileExists = true
  } catch (err) {
    if (err.message === 'NotFound')
      isFileExists = false
    else
      throw err
  }

  return isFileExists
}

function getFileKeyForS3 (absPath) {
  // - make it sure to be normalized.
  // - remove foremost slash.
  let key = path.normalize(absPath)
  key = key[0] === '/' ? key.substring(1) : key

  return key
}

function getDirKeyForS3 (absDirPath) {
  // make it sure to be normalized like "/aaaaa/bb/ccc".
  let key = path.normalize(absDirPath)

  // "/" -> ""
  // "/aaaaa/bb/ccc" -> "aaaaa/bb/ccc/"
  // "/aaaaa/bb/ccc/" -> "aaaaa/bb/ccc/"
  return key === '/' ? '' : key.substring(1).replace(/\/$/, "") + '/'
}

async function listObjectsOfDirFromS3 (absDirPath, excludeDirFromContents = true) {
  const key = getDirKeyForS3(absDirPath)
  return await listObjectsFromS3(key, excludeDirFromContents)
}

async function listObjectsFromS3 (prefix, excludeDirFromContents = true) {
  let data = await s3.send(new ListObjectsV2Command({Bucket: s3BucketName, Delimiter: '/', Prefix: prefix}))

  if (data.CommonPrefixes === undefined)
    data.CommonPrefixes = []
  if (data.Contents === undefined)
    data.Contents = []

  // There can be object which key is same to directory exactly.
  // We should erase it to make reasonable output to users.
  if (excludeDirFromContents && prefix.substr(-1) === '/') {
    data.Contents = data.Contents.filter((content) => {
      return content.Key !== prefix
    })
  }

  return data
}

exports.ls = async (dirPath = '') => {
  const absDirPath = getAbsolutePath(dirPath)
  const isDirExists = await checkDirExists(absDirPath)

  if (!isDirExists) {
    const isFileExists = await checkFileExists(absDirPath)

    if (isFileExists)
      throw new Error('not a directory: ' + dirPath)
    else
      throw new Error('no such file or directory: ' + dirPath)
  }

  const data = await listObjectsOfDirFromS3(absDirPath)
  let names = []

  for (const commonPrefix of data.CommonPrefixes) {
    const dirPath = commonPrefix.Prefix
    const dirName = path.basename(dirPath) + '/'

    names.push(dirName)
  }

  for (const content of data.Contents) {
    const filePath = content.Key
    const fileName = path.basename(filePath)
    const fileSize = content.Size
    const lastModified = content.LastModified

    names.push(fileName)
  }

  names.sort()

  let result = $('<pre>')
  for (const name of names) {
    result.append($(document.createTextNode(name + '\n')))
  }

  return result
}

exports.mkdir = async (dirPath) => {
  const absDirPath = getAbsolutePath(dirPath)
  const isDirExists = await checkDirExists(absDirPath)

  if (isDirExists)
    throw new Error('directory already exists: ' + dirPath)
  else {
    const isFileExists = await checkFileExists(absDirPath)

    if (isFileExists)
      throw new Error('file exists: ' + dirPath)
    else {
      const key = getDirKeyForS3(absDirPath)
      await s3.send(new PutObjectCommand({Bucket: s3BucketName, Key: key}))
    }
  }
}

exports.rmdir = async (dirPath) => {
  const absDirPath = getAbsolutePath(dirPath)
  const { isDirExists, isDirExistsAndEmpty } = await checkDirExistsAndEmpty(absDirPath)

  if (isDirExists) {
    if (isDirExistsAndEmpty) {
      const key = getDirKeyForS3(absDirPath)
      await s3.send(new DeleteObjectCommand({Bucket: s3BucketName, Key: key}))
    }
    else
      throw new Error('directory not empty: ' + dirPath)
  }
  else {
    const isFileExists = await checkFileExists(absDirPath)

    if (isFileExists)
      throw new Error('not a directory: ' + dirPath)
    else
      throw new Error('no such file or directory: ' + dirPath)
  }
}

exports.cat = async (filePath) => {
  const absFilePath = getAbsolutePath(filePath)

  try {
    const key = getFileKeyForS3(absFilePath)
    const {Body} = await s3.send(new GetObjectCommand({Bucket: s3BucketName, Key: key}))
    const data = await Body.getReader().read()
    const text = data.value === undefined ? '' : Buffer.from(data.value).toString('utf-8')
    return $('<pre>').text(text)
  } catch (err) {
    if (err.message === 'NoSuchKey')
      throw new Error('no such file: ' + filePath)
    else
      throw err
  }
}

async function assertFileExists (filePath) {
  const absFilePath = getAbsolutePath(filePath)
  const isFileExists = await checkFileExists(absFilePath)

  if (!isFileExists) {
    const isDirExists = await checkDirExists(absFilePath)

    if (isDirExists)
      throw new Error('is a directory: ' + filePath)
    else
      throw new Error('no such file or directory: ' + filePath)
  }
}

async function assertFileIsCreatable (filePath) {
  const absFilePath = getAbsolutePath(filePath)
  const lastChar = absFilePath.substr(-1)
  const isDirExists = await checkDirExists(absFilePath)

  if (isDirExists)
    throw new Error('is a directory: ' + filePath)

  // The path means a directory. So, it can't be a file.
  // Use same error message in general shell.
  if (lastChar === '/')
    throw new Error('no such file or directory: ' + filePath)
}

exports.redirectToFile = async (filePath, content) => {
  await assertFileIsCreatable(filePath)

  const absFilePath = getAbsolutePath(filePath)
  const key = getFileKeyForS3(absFilePath)
  await s3.send(new PutObjectCommand({Bucket: s3BucketName, Key: key, Body: content}))
}

exports.rm = async (filePath) => {
  await assertFileExists(filePath)

  const absFilePath = getAbsolutePath(filePath)
  const key = getFileKeyForS3(absFilePath)
  await s3.send(new DeleteObjectCommand({Bucket: s3BucketName, Key: key}))
}

exports.cp = async (srcFilePath, dstFilePath) => {
  await assertFileExists(srcFilePath)
  await assertFileIsCreatable(dstFilePath)

  const absSrcFilePath = getAbsolutePath(srcFilePath)
  const absDstFilePath = getAbsolutePath(dstFilePath)

  try {
    const srcKey = getFileKeyForS3(absSrcFilePath)
    // NOTE: It is inserted to http header as X-Amz-Copy-Source. But aws sdk don't encode the value.
    // So we should encodeURI for the value ourself.
    const copySource = encodeURIComponent('/' + s3BucketName + '/' + srcKey)
    const dstKey = getFileKeyForS3(absDstFilePath)
    await s3.send(new CopyObjectCommand({Bucket: s3BucketName, CopySource: copySource, Key: dstKey}))
    return
  } catch (err) {
    if (err.message === 'NoSuchKey')
      throw new Error('no such file: ' + filePath)
    else
      throw err
  }
}
