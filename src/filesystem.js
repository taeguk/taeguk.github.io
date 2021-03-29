const path = require('path').posix
const {S3Client, ListObjectsV2Command, HeadObjectCommand, GetObjectCommand, PutObjectCommand, DeleteObjectCommand} = require('@aws-sdk/client-s3');
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
  const type = absDirPath === '/' ? 'dir' : await getPathType(absDirPath)

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
  let data = await s3.send(new ListObjectsV2Command({Bucket: 'taeguk-github-io-public', Delimiter: '/', Prefix: prefix}))

  // If not found, try to matched directory in siblings.
  if (data.CommonPrefixes === undefined || data.CommonPrefixes.length === 0) {
    // Remove trailing slash.
    prefix = prefix.replace(/\/$/, "")
    data = await s3.send(new ListObjectsV2Command({Bucket: 'taeguk-github-io-public', Delimiter: '/', Prefix: prefix}))
  }

  if (data.CommonPrefixes === undefined || data.CommonPrefixes.length === 0)
    return keyword
  else
    return path.relative(absCurPath, data.CommonPrefixes[0].Prefix) + '/'
}

exports.autoCompleteFile = async (keyword) => {
  const absCurPath = getAbsoluteCurrentPath()
  const prefix = getFileKeyForS3(absCurPath + '/' + keyword)
  const data = await s3.send(new ListObjectsV2Command({Bucket: 'taeguk-github-io-public', Prefix: prefix, MaxKeys: 1}))

  if (data.Contents !== undefined && data.Contents.length > 0)
    return path.relative(absCurPath, data.Contents[0].Key)
  else
    return keyword
}

// NOTE: Due to the nature of S3, fileOrDir can be ambiguous. In other words, it can mean file and directory both.
// In the ambiguous case, it returns 'dir'.
async function getPathType (absPath) {
  const dirKey = getDirKeyForS3(absPath)
  const dirData = await s3.send(new ListObjectsV2Command({Bucket: 'taeguk-github-io-public', Prefix: dirKey, MaxKeys: 1}))
  const isDirExists = dirData.Contents !== undefined && dirData.Contents.length > 0

  if (isDirExists)
    return 'dir'
  else {
    const fileKey = getFileKeyForS3(absPath)
    let isFileExists
    try {
      await s3.send(new HeadObjectCommand({Bucket: 'taeguk-github-io-public', Delimiter: '/', Key: fileKey}))
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
  let data = await s3.send(new ListObjectsV2Command({Bucket: 'taeguk-github-io-public', Delimiter: '/', Prefix: key}))

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
    const {Body} = await s3.send(new GetObjectCommand({Bucket: 'taeguk-github-io-public', Key: key}))
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

exports.redirectToFile = async (filePath, content) => {
  const absFilePath = getAbsolutePath(filePath)
  const lastChar = absFilePath.substr(-1)
  const type = await getPathType(absFilePath)

  switch (type) {
    case 'dir':
      throw new Error('is a directory: ' + filePath)

    case 'not_exists':
      if (lastChar === '/')
        throw new Error('no such file or directory: ' + filePath)
      else {
        // The path means file, not directory. So pass to next case to make the file.
      }

    case 'file':
      const key = getFileKeyForS3(absFilePath)
      await s3.send(new PutObjectCommand({Bucket: 'taeguk-github-io-public', Key: key, Body: content}))
      break

    default:
      throw new Error('unknown error')
  }
}

exports.rm = async (filePath) => {
  const absFilePath = getAbsolutePath(filePath)
  const lastChar = absFilePath.substr(-1)
  const type = await getPathType(absFilePath)

  switch (type) {
    case 'not_exists':
      throw new Error('no such file or directory: ' + filePath)

    case 'dir':
      if (lastChar === '/')
        throw new Error('is a directory: ' + filePath)
      else {
        // If the path means file, not directory, the file can also exist. So pass to next case to try to remove the file.
      }

    case 'file':
      try {
        const key = getFileKeyForS3(absFilePath)
        await s3.send(new DeleteObjectCommand({Bucket: 'taeguk-github-io-public', Key: key}))
        return
      } catch (err) {
        if (err.message === 'NoSuchKey')
          throw new Error('no such file: ' + filePath)
        else
          throw err
      }

    default:
      throw new Error('unknown error')
  }
}
