/*
  Originally written by Kartike Bansal. (https://github.com/kraten/terminal-resume)
  I copied that and modified for my purposes.
*/

const filesystem = require('./filesystem.js')

// For commmand history
let cmdHistories = []
let cmdCursor = 0
let availableCmds = $('.command').map((index, dom) => { return dom.id }).toArray()

$('#terminal__prompt--command').keydown(async function(event){
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
    tabCompletion()
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
  const targetFiles = redirectParts.map((v,i,a) => { return v.trim().split(' ')[0] })

  return [rawInput, cmd, params, targetFiles]
}

async function runCommand(){
  const [rawInput, cmd, params, redirectTargetFiles] = parseInput()

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
          clear_console()
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
          if (params.length === 0)
            cmdResult = await filesystem.cd('/')
          else
            cmdResult = await filesystem.cd(params[0])
          break

        case 'ls':
          if (params.length === 0)
            cmdResult = await filesystem.ls()
          break

        case 'cat':
          if (params.length > 0)
            cmdResult = await filesystem.cat(params[0])
          break
      }
    } catch (err) {
      console.log(err)
      cmdResult = $('<pre>').text(err.message)
    }

    // If necessary, redirect results to files.
    if (redirectTargetFiles.length > 0) {
      try {
        const content = cmdResult.text()
        await redirectTargetFiles.forEach(targetFile =>
          filesystem.redirectToFile(targetFile, content)
        )
        cmdResult = $('')
      } catch (err) {
        console.log(err)
        cmdResult = $('<pre>').text(err.message)
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

function tabCompletion(){
  // Get input
  let cmdLine = $('#terminal__prompt--command')   
  let input = cmdLine.val()
  
  for (i = 0; i < availableCmds.length; i++) { 
    if (availableCmds[i].startsWith(input)){
      cmdLine.val(availableCmds[i])
      break
    }
  }
}

function clear_console(){
  $('#executed_commands').empty()
  $('#terminal__prompt--command').val('')
}
