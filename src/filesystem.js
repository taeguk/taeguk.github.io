const path = require('path').posix
const {S3Client, ListObjectsV2Command, HeadObjectCommand, GetObjectCommand, PutObjectCommand} = require('@aws-sdk/client-s3');
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

function getAbsolutePath (filePath) {
  const curDir = $('.current_location').first().text()
  let targetDir

  if (filePath.startsWith('/'))
    targetDir = filePath
  else
    targetDir = curDir + '/' + filePath

  targetDir = path.normalize(targetDir)
  return targetDir
}

exports.cd = async function (dir) {
  let targetDir = getAbsolutePath(dir)
  const type = targetDir === '/' ? 'dir' : await getPathType(targetDir)

  switch (type) {
    case 'dir':
      // remove trailing slash except foremost slash
      let location = targetDir === '/' ? '/' : targetDir.replace(/\/$/, "")
      $('.current_location').text(location)
      return $('')

    case 'file':
      throw new Error('not a directory: ' + dir)

    case 'not_exists':
      throw new Error('no such file or directory: ' + dir)

    default:
      throw new Error('unknown error')
  }
}

exports.autoCompleteDir = async function (keyword) {
  const curDir = $('.current_location').first().text()

  // First, try to find matched directory in childs.
  var prefix = getDirKeyForS3(curDir + '/' + keyword)
  var data = await s3.send(new ListObjectsV2Command({Bucket: 'taeguk-github-io-public', Delimiter: '/', Prefix: prefix}))

  // If not found, try to matched directory in siblings.
  if (data.CommonPrefixes === undefined || data.CommonPrefixes.length === 0) {
    // Remove trailing slash.
    prefix = prefix.replace(/\/$/, "")
    data = await s3.send(new ListObjectsV2Command({Bucket: 'taeguk-github-io-public', Delimiter: '/', Prefix: prefix}))
  }

  if (data.CommonPrefixes === undefined || data.CommonPrefixes.length === 0)
    return keyword
  else
    return path.relative(curDir, data.CommonPrefixes[0].Prefix) + '/'
}

exports.autoCompleteFile = async function (keyword) {
  const curDir = $('.current_location').first().text()
  const prefix = getFileKeyForS3(curDir + '/' + keyword)
  const data = await s3.send(new ListObjectsV2Command({Bucket: 'taeguk-github-io-public', Prefix: prefix, MaxKeys: 1}))

  if (data.Contents !== undefined && data.Contents.length > 0)
    return path.relative(curDir, data.Contents[0].Key)
  else
    return keyword
}

async function getPathType (fileOrDir) {
  const dirKey = getDirKeyForS3(fileOrDir)
  const dirData = await s3.send(new ListObjectsV2Command({Bucket: 'taeguk-github-io-public', Prefix: dirKey, MaxKeys: 1}))
  const isDirExists = dirData.Contents !== undefined && dirData.Contents.length > 0

  if (isDirExists)
    return 'dir'
  else {
    const fileKey = getFileKeyForS3(fileOrDir)
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

function getFileKeyForS3 (filePath) {
  // - make it sure to be normalized.
  // - remove foremost slash.
  // - remove trailing slash.
  filePath = path.normalize(filePath)
  filePath = filePath[0] === '/' ? filePath.substring(1) : filePath
  filePath = filePath.replace(/\/$/, "")

  return filePath
}

function getDirKeyForS3 (dir) {
  // make it sure to be normalized like "/aaaaa/bb/ccc".
  dir = path.normalize(dir)

  // "/" -> ""
  // "/aaaaa/bb/ccc" -> "aaaaa/bb/ccc/"
  // "/aaaaa/bb/ccc/" -> "aaaaa/bb/ccc/"
  return dir === '/' ? '' : dir.substring(1).replace(/\/$/, "") + '/'
}

async function listObjectsFromS3 (dir) {
  const dirKey = getDirKeyForS3(dir)
  let data = await s3.send(new ListObjectsV2Command({Bucket: 'taeguk-github-io-public', Delimiter: '/', Prefix: dirKey}))

  if (data.CommonPrefixes === undefined)
    data.CommonPrefixes = []
  if (data.Contents === undefined)
    data.Contents = []

  return data
}

exports.ls = async function () {
  const curDir = $('.current_location').first().text()
  const data = await listObjectsFromS3(curDir)
  let result = $('<pre>')

  data.CommonPrefixes.forEach(commonPrefix => {
    const dirPath = commonPrefix.Prefix
    const dirName = path.basename(dirPath) + '/'

    result.append($(document.createTextNode(dirName + '\n')))
  })

  data.Contents.forEach(content => {
    const filePath = content.Key
    const fileName = path.basename(filePath)
    const fileSize = content.Size
    const lastModified = content.LastModified

    result.append($(document.createTextNode(fileName + '\n')))
  })

  return result
}

exports.cat = async function (filePath) {
  filePath = getAbsolutePath(filePath)
  const type = await getPathType(filePath)

  switch (type) {
    case 'dir':
      throw new Error('is a directory: ' + filePath)

    case 'file':
      const key = getFileKeyForS3(filePath)
      const data = await s3.send(new GetObjectCommand({Bucket: 'taeguk-github-io-public', Key: key}))
      return $('<pre>').text(data.Body.toString('utf-8'))

    case 'not_exists':
      throw new Error('no such file or directory: ' + filePath)

    default:
      throw new Error('unknown error')
  }
}

exports.redirectToFile = async function (filePath, content) {
  filePath = getAbsolutePath(filePath)
  const type = await getPathType(filePath)

  switch (type) {
    case 'dir':
      throw new Error('is a directory: ' + filePath)

    case 'file':
    case 'not_exists':
      const key = getFileKeyForS3(filePath)
      await s3.send(new PutObjectCommand({Bucket: 'taeguk-github-io-public', Key: key, Body: content}))

    default:
      throw new Error('unknown error')
  }
}
