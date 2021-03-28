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

  var status = await getFileStatus(targetDir)
  switch (status) {
    case 'dir':
      $('.current_location').text(targetDir)
      return $('<div>').text('')

    case 'file':
      return $('<div>').text('not a directory: ' + dir)

    case 'not_exists':
      return $('<div>').text('no such file or directory: ' + dir)

    default:
      return $('<div>').text('unknown error')
  }
}

async function getFileStatus (filePath) {
  var status
  const prefixForS3 = getKeyForS3(filePath)

  await s3.listObjectsV2({Delimiter: '/', Prefix: prefixForS3, MaxKeys: 1}, (err, data) => {
    if (err)
      throw err
    else {
      const isDirExists = data.CommonPrefixes.length > 0
      const isFileExists = data.Contents.length > 0

      if (isDirExists)
        status = 'dir'
      else if (isFileExists)
        status = 'file'
      else
        status = 'not_exists'
    }
  }).promise()

  return status
}

function getKeyForS3 (filePath) {
  // - make it sure to be normalized.
  // - remove first slash.
  // - remove last slash.
  filePath = path.normalize(filePath)
  filePath = filePath[0] === '/' ? filePath.substring(1) : filePath
  filePath = filePath.replace(/\/$/, "")

  return filePath
}

function getDirListingPrefixForS3 (dir) {
  // make it sure to be normalized like "/aaaaa/bb/ccc".
  dir = path.normalize(dir)

  // "/aaaaa/bb/ccc" -> "aaaaa/bb/ccc/"
  // "/" -> ""
  return dir === '/' ? '' : dir.substring(1) + '/'
}

exports.ls = async function () {
  var result = $('<div>')

  const curDir = $('.current_location').first().text()
  const prefixForS3 = getDirListingPrefixForS3(curDir)

  await s3.listObjectsV2({Delimiter: '/', Prefix: prefixForS3}, (err, data) => {
    if (err)
      throw err
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

  return result
}

exports.cat = async function (filePath) {
  const status = await getFileStatus(filePath)

  switch (status) {
    case 'dir':
      return $('<div>').text('is a directory: ' + filePath)

    case 'file':
      var result = $('<pre>')
      const key = getKeyForS3(filePath)

      await s3.getObject({Key: key}, (err, data) => {
        if (err)
          throw err
        else
          result.text(data.Body.toString('utf-8'))
      }).promise()

      return result

    case 'not_exists':
      return $('<div>').text('no such file or directory: ' + filePath)

    default:
      return $('<div>').text('unknown error')
  }
}
