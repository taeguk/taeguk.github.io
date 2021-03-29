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
  const type = await getPathType(absDirPath)

  switch (type) {
    case 'dir':
      setAbsolueCurrentPath(absDirPath)
      break

    case 'file':
      throw new Error('not a directory: ' + dirPath)

    case 'not_exists':
      throw new Error('no such file or directory: ' + dirPath)

    default:
      throw new Error('unknown error')
  }
}

exports.autoCompleteDir = async (keyword) => {
  const absCurPath = getAbsoluteCurrentPath()

  // First, try to find matched directory in childs.
  let prefix = getDirKeyForS3(absCurPath + '/' + keyword)
  let data = await s3.send(new ListObjectsV2Command({Bucket: s3BucketName, Delimiter: '/', Prefix: prefix}))

  // If not found, try to matched directory in siblings.
  if (data.CommonPrefixes === undefined || data.CommonPrefixes.length === 0) {
    // Remove trailing slash.
    prefix = prefix.replace(/\/$/, "")
    data = await s3.send(new ListObjectsV2Command({Bucket: s3BucketName, Delimiter: '/', Prefix: prefix}))
  }

  if (data.CommonPrefixes === undefined || data.CommonPrefixes.length === 0)
    return keyword
  else
    return path.relative(absCurPath, data.CommonPrefixes[0].Prefix) + '/'
}

exports.autoCompleteFile = async (keyword) => {
  const absCurPath = getAbsoluteCurrentPath()
  const prefix = getFileKeyForS3(absCurPath + '/' + keyword)
  const data = await s3.send(new ListObjectsV2Command({Bucket: s3BucketName, Prefix: prefix, MaxKeys: 1}))

  if (data.Contents !== undefined && data.Contents.length > 0)
    return path.relative(absCurPath, data.Contents[0].Key)
  else
    return keyword
}

// NOTE: Due to the nature of S3, fileOrDir can be ambiguous. In other words, it can mean file and directory both.
// In the ambiguous case, it returns 'dir'.
async function getPathType (absPath) {
  const dirKey = getDirKeyForS3(absPath)
  const dirData = await s3.send(new ListObjectsV2Command({Bucket: s3BucketName, Prefix: dirKey, MaxKeys: 1}))
  const isDirExists = dirData.Contents !== undefined && dirData.Contents.length > 0

  if (isDirExists)
    return 'dir'
  else {
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

    if (isFileExists)
      return 'file'
    else
      return 'not_exists'
  }
}

// NOTE: It keeps trailing slash.
// If `absFilePath` has trailing slash, it means directory.
// S3 will return a file which has same name if we erase trailing slash here.
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

async function listObjectsFromS3 (absDirPath) {
  const key = getDirKeyForS3(absDirPath)
  let data = await s3.send(new ListObjectsV2Command({Bucket: s3BucketName, Delimiter: '/', Prefix: key}))

  if (data.CommonPrefixes === undefined)
    data.CommonPrefixes = []
  if (data.Contents === undefined)
    data.Contents = []

  return data
}

exports.ls = async () => {
  const absCurPath = getAbsoluteCurrentPath()
  const data = await listObjectsFromS3(absCurPath)
  let result = $('<pre>')

  for (const commonPrefix of data.CommonPrefixes) {
    const dirPath = commonPrefix.Prefix
    const dirName = path.basename(dirPath) + '/'

    result.append($(document.createTextNode(dirName + '\n')))
  }

  for (const content of data.Contents) {
    const filePath = content.Key
    const fileName = path.basename(filePath)
    const fileSize = content.Size
    const lastModified = content.LastModified

    result.append($(document.createTextNode(fileName + '\n')))
  }

  return result
}

exports.cat = async (filePath) => {
  const absFilePath = getAbsolutePath(filePath)

  try {
    const key = getFileKeyForS3(absFilePath)
    const {Body} = await s3.send(new GetObjectCommand({Bucket: s3BucketName, Key: key}))
    const data = await Body.getReader().read()
    const text = Buffer.from(data.value).toString('utf-8')
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
  const lastChar = absFilePath.substr(-1)
  const type = await getPathType(absFilePath)

  switch (type) {
    case 'not_exists':
      throw new Error('no such file or directory: ' + filePath)

    case 'dir':
      if (lastChar === '/')
        throw new Error('is a directory: ' + filePath)
      else 
        // TODO: Do something to make sure that the file exists or not.
        // The path means file, not directory. So the file can exist or not. But no try to make sure it.
        break

    case 'file':
      break

    default:
      throw new Error('unknown error')
  }
}

async function assertFileIsCreatable (filePath) {
  const absFilePath = getAbsolutePath(filePath)
  const lastChar = absFilePath.substr(-1)
  const type = await getPathType(absFilePath)

  switch (type) {
    case 'dir':
      throw new Error('is a directory: ' + filePath)

    case 'not_exists':
      if (lastChar === '/')
        // The path means a directory. So, it can't be a file.
        throw new Error('no such file or directory: ' + filePath)
      else
        break

    case 'file':
      // Allow overwriting.
      break

    default:
      throw new Error('unknown error')
  }
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
  const response = await s3.send(new DeleteObjectCommand({Bucket: s3BucketName, Key: key}))
}

exports.cp = async (srcFilePath, dstFilePath) => {
  await assertFileExists(srcFilePath)
  await assertFileIsCreatable(dstFilePath)

  const absSrcFilePath = getAbsolutePath(srcFilePath)
  const absDstFilePath = getAbsolutePath(dstFilePath)

  try {
    const srcKey = getFileKeyForS3(absSrcFilePath)
    const copySource = '/' + s3BucketName + '/' + srcKey
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
