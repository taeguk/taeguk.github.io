/*
  I refer some codes of https://github.com/kraten/terminal-resume
*/

const filesystem = require('./filesystem.js')

// For commmand history
let cmdHistories = []
let cmdCursor = 0
let availableCmds = $('.command').map((index, dom) => { return dom.id }).toArray()

$('#terminal__prompt--command').keydown(async (event) => {
  // Number 13 is the 'Enter' key on the keyboard
  if (event.keyCode === 13) {
    // Cancel the default action, if needed
    event.preventDefault()
    await runCommand()
  }
  // Number 38 is for 'Up Arrow' key on the keyboard
  else if (event.keyCode === 38) {
    // Cancel the default action, if needed
    event.preventDefault()
    cycleCommand('up')
  }
  // Number 40 is for 'Down Arrow' key on the keyboard
  else if (event.keyCode === 40) {
    // Cancel the default action, if needed
    event.preventDefault()
    cycleCommand('down')
  }
  // Number 9 is for 'Tab' key on the keyboard
  else if (event.keyCode === 9) {
    // Cancel the default action, if needed
    event.preventDefault()
    await autoComplete()
  }
})

$('#terminal__body').click(function(){
  $('#terminal__prompt--command').focus()
})

function parseInput() {
  const cmdLine = $('#terminal__prompt--command')
  const rawInput = cmdLine.val()
  const [cmdAndParams, ...redirectParts] = rawInput.trim().split('>')
  const [cmd, ...params] = cmdAndParams.trim().split(' ')

  // Same hehavior of bash shell
  // ["1 2", "3 4"] => ["1", "3"]
  const redirectTargetFiles = redirectParts.map((v,i,a) => { return v.trim().split(' ')[0] })

  return { rawInput, cmdAndParams, cmd, params, redirectTargetFiles }
}

async function runCommand(){
  const { rawInput, cmdAndParams, cmd, params, redirectTargetFiles } = parseInput()

  console.log(
    'raw input : ' + rawInput + '\n' +
    'cmd : ' + cmd + '\n' +
    'params : ' + params + '\n' +
    'redirectTargetFiles : ' + redirectTargetFiles
  )

  let output
  let prompt = $('#prompt').clone().append($('<span style="white-space:pre">').text(rawInput)).removeAttr('id')
  prompt.find('*').removeClass('current_location')  

  if (cmd !== ''){
    // Get command from input field 
    let cmdResult

    try {
      cmdResult = $('#' + cmd)
    } catch(err) {
      cmdResult = []
    }
    
    // Error command, if command not found
    if (cmdResult.length === 0)
      cmdResult = $('#error').clone().text(function(index,text){
        return text.replace('{0}', cmd)
      })

    try {
      switch (cmd) {
        case 'clear':
          clearConsole()
          return
            
        case 'exit':
          // It doensn't work with the message "Scripts may close only the windows that were opened by them".
          // window.close()
          window.close() // 일반적인 현재 창 닫기
          window.open('about:blank', '_self').self.close()  // IE에서 묻지 않고 창 닫기
          return

        case 'history':
          cmdResult = $('<pre>')
          for (i = 0; i < cmdHistories.length; i++) {
            cmdResult.append($(document.createTextNode((i+1) + ': ' + cmdHistories[i] + '\n')))
          }
          break

        case 'linkedin':
        case 'github':
        case 'blog':
        case 'facebook':
          window.open(cmdResult.find('a').attr('href'), '_blank')
          break

        case 'pwd':
          cmdResult = $('<pre>').text($('.current_location').first().text())
          break;

        case 'cd':
          const dirPath = params.length > 0 ? params[0] : '/'
          await filesystem.cd(dirPath)
          cmdResult = $('')
          break

        case 'ls':
          if (params.length === 0)
            cmdResult = await filesystem.ls()
          else if (params.length === 1)
            cmdResult = await filesystem.ls(params[0])
          break

        case 'mkdir':
          if (params.length > 0) {
            for (const dirPath of params)
              await filesystem.mkdir(dirPath)
            cmdResult = $('')
          }
          break

        case 'rmdir':
          if (params.length > 0) {
            for (const dirPath of params)
              await filesystem.rmdir(dirPath)
            cmdResult = $('')
          }
          break

        case 'echo':
          const content = (cmdAndParams.slice(cmdAndParams.indexOf('echo') + 4)).trim()
          cmdResult = $('<pre>').text(content)
          break

        case 'cat':
          if (params.length === 1)
            cmdResult = await filesystem.cat(params[0])
          break

        case 'rm':
          if (params.length > 0) {
            for (const filePath of params)
              await filesystem.rm(filePath)
            cmdResult = $('')
          }
          break

        case 'cp':
          if (params.length == 2) {
            await filesystem.cp(params[0], params[1])
            cmdResult = $('')
          }
          break

        // TODO: resource leak occurs when an user cancel uploading.
        case 'upload':
          if (params.length === 0) {
            let fileInput = $('<input type="file" name="files[]">')

            let fileUploadPromise = new Promise((resolve, reject) => {
              fileInput.change(() => {
                const file = fileInput[0].files[0]
                var reader = new FileReader()
                reader.onloadend = resolve
                reader.onerror = reject
                reader.readAsText(file);
              })
            })

            fileInput.trigger('click')
            const progress = await fileUploadPromise

            cmdResult = $('<pre>').text(progress.target.result)
          }
          break
      }
    } catch (err) {
      console.log(err)
      const errorMessage = err.message.trim() === '' ? 'unknown error' : err.message
      cmdResult = $('<pre>').text(errorMessage)
    }

    // If necessary, redirect results to files.
    if (redirectTargetFiles.length > 0) {
      try {
        const content = cmdResult.text()
        for (const targetFile of redirectTargetFiles)
          await filesystem.redirectToFile(targetFile, content)
        cmdResult = $('')
      } catch (err) {
        console.log(err)
        const errorMessage = err.message.trim() === '' ? 'unknown error' : err.message
        cmdResult = $('<pre>').text(errorMessage)
      }
    }

    // Create a clone to show as command output
    output = cmdResult.clone().removeAttr('id').removeClass('html_template')
  }

  // Get command output in HTML format
  let executedCommand = $('<div>').append(prompt).append(output).append('<br/>')

  // Append the command output to the executed commands div container
  $('#executed_commands').append(executedCommand)

  // Clear the command input field
  $('#terminal__prompt--command').val('')

  // Append input command to command list
  if (cmd !== ''){
    cmdHistories.push(rawInput)
    cmdCursor = cmdHistories.length
  }

  // Scroll to the end
  let scrollingElement = (document.scrollingElement || document.body)
  scrollingElement.scrollTop = scrollingElement.scrollHeight

  $('#terminal__body').scrollTop($('#terminal__body').prop('scrollHeight'))
}

// Cycle through commands list using arrow keys
function cycleCommand(direction){
  if (direction === 'up'){
    if (cmdCursor > 0)
      cmdCursor -= 1
  }
  else if (direction === 'down'){
    if (cmdCursor < cmdHistories.length)
      cmdCursor += 1
  }

  // Update input
  let cmdLine = $('#terminal__prompt--command')
  if (cmdCursor < cmdHistories.length)
    cmdLine.val(cmdHistories[cmdCursor])
  else
    cmdLine.val('')
}

async function autoComplete(){
  const { rawInput, cmdAndParams, cmd, params, redirectTargetFiles } = parseInput()
  const trimmedRawInput = rawInput.trim()
  const lastCharOfTrimned = trimmedRawInput.substr(-1)
  const lastChar = rawInput.substr(-1)

  let target, keyword

  // It means typing a command and parameters is finished. So the place is for redirection target file.
  if (redirectTargetFiles.length > 0 || lastCharOfTrimned === '>') {
    target = 'file'
    keyword = redirectTargetFiles.length > 0 && lastChar !== ' ' ? redirectTargetFiles[redirectTargetFiles.length - 1] : ''
  }
  // It means typing a command is finished. So the place is for parameters.
  else if (params.length > 0 || lastChar !== lastCharOfTrimned) {
    if (cmd === 'cd' || cmd === 'ls' || cmd === 'mkdir' || cmd === 'rmdir')
      target = 'dir'
    else
      target = 'file'

    keyword = params.length > 0 && lastChar !== ' ' ? params[params.length - 1] : ''
  }
  // It means still typing a command.
  else {
    target = 'cmd'
    keyword = cmd
  }

  let autoCompleted = keyword
  switch (target) {
    case 'file':
      autoCompleted = await filesystem.autoCompleteFile(keyword)
      break

    case 'dir':
      autoCompleted = await filesystem.autoCompleteDir(keyword)
      break

    case 'cmd':
      autoCompleted = autoCompleteCmd(keyword)
      break
  }

  const indexToBeInserted = rawInput.length - keyword.length
  var modifiedCmdLine = rawInput.slice(0, indexToBeInserted) + autoCompleted
  if (autoCompleted.substr(-1) !== '/' && autoCompleted !== keyword)
    modifiedCmdLine += ' '
  $('#terminal__prompt--command').val(modifiedCmdLine)

  console.log('auto complete of keyword: ' + keyword + ' -> ' + autoCompleted)
  console.log('auto complete of cmdline: ' + rawInput + ' -> ' + modifiedCmdLine)
}

function autoCompleteCmd(keyword){
  for (const cmd of availableCmds) {
    if (cmd.startsWith(keyword))
      return cmd
  }
  return keyword
}

function clearConsole(){
  $('#executed_commands').empty()
  $('#terminal__prompt--command').val('')
}
