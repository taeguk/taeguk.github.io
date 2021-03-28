const path = require('path').posix

var AWS = require('aws-sdk');
AWS.config.region = 'ap-northeast-2'
AWS.config.credentials = new AWS.CognitoIdentityCredentials({
  IdentityPoolId: 'ap-northeast-2:6fafadd5-4e84-4213-83a4-8b8e5bf7aef2',
})

var s3 = new AWS.S3({
  apiVersion: '2006-03-01',
  params: {Bucket: 'taeguk-github-io-public'}
})

exports.cd = async function (dir) {
  const curDir = $('.current_location').first().text()
  var targetDir

  if (dir.startsWith('/'))
    targetDir = dir
  else
    targetDir = curDir + '/' + dir

  targetDir = path.normalize(targetDir)

  // Remove trailing slash.
  if (targetDir !== '/')
    targetDir = targetDir.replace(/\/$/, "")

  var existence = await checkDirExistence(targetDir)
  switch (existence) {
    case 'exists':
      $('.current_location').text(targetDir)
      return $('<div>').text('')

    case 'is_file':
      return $('<div>').text('not a directory: ' + dir)

    case 'not_exists':
      return $('<div>').text('no such file or directory: ' + dir)

    default:
      return $('<div>').text('unknown error')
  }
}

async function checkDirExistence (dir) {
  var result
  const prefixForS3 = dir.substring(1) // remove first slash.

  await s3.listObjectsV2({Delimiter: '/', Prefix: prefixForS3, MaxKeys: 1}, (err, data) => {
    if (err)
      throw err
    else {
      const isDirExists = data.CommonPrefixes.length > 0
      const isFileExists = data.Contents.length > 0

      if (isDirExists)
        result = 'exists'
      else if (isFileExists)
        result = 'is_file'
      else
        result = 'not_exists'
    }
  }).promise()

  return result
}

function getDirPrefixForS3 (dir) {
  // "/aaaaa/bb/ccc" -> "aaaaa/bb/ccc/"
  // "/" -> ""
  dir = dir.trim()
  return dir === '/' ? '' : dir.substring(1) + '/'
}

exports.ls = async function () {
  var result = $('<div>')

  const curDir = $('.current_location').first().text()
  const prefixForS3 = getDirPrefixForS3(curDir)

  try {
    await s3.listObjectsV2({Delimiter: '/', Prefix: prefixForS3}, (err, data) => {
      if (err) {
        result.append($('<div>').text(err.message))
      }
      else {
        data.CommonPrefixes.map(function(commonPrefix) {
          const dirPath = commonPrefix.Prefix
          const dirName = path.basename(dirPath) + '/'
          result.append($('<div>').text(dirName))
        })

        data.Contents.map(function(content) {
          const filePath = content.Key
          const fileName = path.basename(filePath)
          const fileSize = content.Size
          const lastModified = content.LastModified

          result.append($('<div>').text(fileName))
        })
      }
    }).promise()
  } catch (err) {
    result.append($('<div>').text(err.message))
  }

  return result
}
