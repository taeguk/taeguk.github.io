/*
  Originally written by Kartike Bansal. (https://github.com/kraten/terminal-resume)
  I copied that and modified for my purposes.
*/

const filesystem = require('./filesystem.js')

// For commmand history
var cmdHistories = []
var cmdCursor = 0
var availableCmds = $('.command').map((index, dom) => { return dom.id }).toArray()

$('#terminal__prompt--command').keydown(event => {
  // Number 13 is the 'Enter' key on the keyboard
  if (event.keyCode === 13) {
    // Cancel the default action, if needed
    event.preventDefault()
    runCommand()
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

async function runCommand(){
  var cmd = $('#terminal__prompt--command')
  var input = cmd.val()
  const [inputCmd, ...inputParams] = input.split(' ')
  var output

  var prompt = $('#prompt').clone().append($('<span style="white-space:pre">').text(input)).removeAttr('id')
  prompt.find('*').removeClass('current_location')
  
  if (inputCmd != ''){
    // Get command from input field 
    var cmdResult

    try {
      cmdResult = $('#' + inputCmd)
    } catch(err) {
      cmdResult = []
    }
    
    // Error command, if command not found
    if (cmdResult.length === 0)
      cmdResult = $('#error').clone().text(function(index,text){
        return text.replace('{0}', inputCmd)
      })

    try {
      switch (inputCmd) {
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
          cmdResult = $('<div>')
          for (i = 0; i < cmdHistories.length; i++) {
            cmdResult.append($('<div style="white-space:pre">').text((i+1) + ': ' + cmdHistories[i].trim()))
          }
          break

        case 'linkedin':
        case 'github':
        case 'blog':
        case 'facebook':
          window.open(cmdResult.find('a').attr('href'), '_blank')
          break

        case 'pwd':
          cmdResult = $('<div>').text($('.current_location').first().text())
          break;

        case 'cd':
          if (inputParams.length == 0)
            cmdResult = await filesystem.cd('/')
          else
            cmdResult = await filesystem.cd(inputParams[0])
          break

        case 'ls':
          cmdResult = await filesystem.ls()
          break
      }
    } catch (err) {
      cmdResult = $('<div>').text(err.message)
    }

    console.log(cmdResult)
    // Create a clone to show as command output
    output = cmdResult.clone().removeAttr('id').removeClass('html_template')
  }

  // Get command output in HTML format
  var cmdOutput = $('<div>').append(prompt).append(output).append('<br/>')

  // Append the command output to the executed commands div container
  $('#executed_commands').append(cmdOutput)

  // Clear the command input field
  cmd.val('')

  // Append input command to command list
  if (inputCmd != ''){
    cmdHistories.push(input)
    cmdCursor = cmdHistories.length
  }

  // Scroll to the end
  var scrollingElement = (document.scrollingElement || document.body)
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
  var cmd = $('#terminal__prompt--command')
  if (cmdCursor < cmdHistories.length)
    cmd.val(cmdHistories[cmdCursor])
  else
    cmd.val('')
}

function tabCompletion(){
  // Get input
  var cmd = $('#terminal__prompt--command')   
  var input = cmd.val()
  
  for (i = 0; i < availableCmds.length; i++) { 
    if (availableCmds[i].startsWith(input)){
      cmd.val(availableCmds[i])
      break
    }
  }
}

function clear_console(){
  $('#executed_commands').empty()
  $('#terminal__prompt--command').val('')
}
