/*
  Originally written by Kartike Bansal. (https://github.com/kraten/terminal-resume)
  I copied that and modified for my purposes.
*/

// For commmand history
var cmd_list = [];
var cmd_index = 0;
var available_cmd = $('.command').map(function(index,dom){return dom.id}).toArray()

$('#terminal__prompt--command').keydown(function(event) {
  // Number 13 is the 'Enter' key on the keyboard
  if (event.keyCode === 13) {
    // Cancel the default action, if needed
    event.preventDefault();
    run_command();
  }
  // Number 38 is for 'Up Arrow' key on the keyboard
  else if (event.keyCode === 38) {
    // Cancel the default action, if needed
    event.preventDefault();
    cycle_command('up');
  }
  // Number 40 is for 'Down Arrow' key on the keyboard
  else if (event.keyCode === 40) {
    // Cancel the default action, if needed
    event.preventDefault();
    cycle_command('down');
  }
  // Number 9 is for 'Tab' key on the keyboard
  else if (event.keyCode === 9) {
    // Cancel the default action, if needed
    event.preventDefault();
    tab_completion();
  }
});

$('#terminal__body').click(function(){
  $('#terminal__prompt--command').focus();
});

function run_command(){
  var cmd = $('#terminal__prompt--command');
  var input = cmd.val()
  var input_cmd = input.trim().replace(/ .*/,''); // Get first word only
  var output;
  
  if (input_cmd != ''){
    // Get command from input field 
    var cmd_result;

    try {
      cmd_result = $('#' + input_cmd);
    } catch(error) {
      cmd_result = [];
    }
    
    // Error command, if command not found
    if (cmd_result.length === 0)
      cmd_result = $('#error').clone().text(function(index,text){
        return text.replace('{0}', input_cmd);
      });

    switch (input_cmd) {
      case 'clear':
        clear_console();
        return;
          
      case 'exit':
        // It doensn't work with the message "Scripts may close only the windows that were opened by them".
        // window.close();
        window.close(); // 일반적인 현재 창 닫기
        window.open('about:blank', '_self').self.close();  // IE에서 묻지 않고 창 닫기
        return;

      case 'history':
        cmd_result = $('<div>')
        for (i = 0; i < cmd_list.length; i++) {
          cmd_result.append($('<div style="white-space:pre">').text((i+1) + ': ' + cmd_list[i].trim()))
        }
        break;

      case 'linkedin':
      case 'github':
      case 'blog':
      case 'facebook':
        window.open(cmd_result.find('a').attr('href'), '_blank');
        break;
    }

    // Create a clone to show as command output
    output = cmd_result.clone().removeAttr('id').removeClass('html_template')
  }

  var prompt = $('#prompt').clone().append($('<span style="white-space:pre">').text(input)).removeAttr('id').removeClass('html_template')

  // Get command output in HTML format
  var cmd_output = $('<div>').append(prompt).append(output).append('<br/>');

  // Append the command output to the executed commands div container
  $('#executed_commands').append(cmd_output);

  // Clear the command input field
  cmd.val('');

  // Append input command to command list
  if (input_cmd != ''){
    cmd_list.push(input);
    cmd_index = cmd_list.length;
  }

  // Scroll to the end
  var scrollingElement = (document.scrollingElement || document.body);
  scrollingElement.scrollTop = scrollingElement.scrollHeight;

  $('#terminal__body').scrollTop($('#terminal__body').prop('scrollHeight'));
}

// Cycle through commands list using arrow keys
function cycle_command(direction){
  if (direction === 'up'){
    if (cmd_index > 0)
      cmd_index -= 1;
  }
  else if (direction === 'down'){
    if (cmd_index < cmd_list.length)
      cmd_index += 1;
  }

  // console.log(cmd_list);
  // console.log(cmd_list.length);
  // console.log(cmd_index);

  // Update input
  var cmd = $('#terminal__prompt--command');
  if (cmd_index < cmd_list.length)
    cmd.val(cmd_list[cmd_index]);
  else
    cmd.val('')
}

function tab_completion(){
  // Get input
  var cmd = $('#terminal__prompt--command');   
  var input = cmd.val();
  
  for (index = 0; index < available_cmd.length; index++) { 
    if (available_cmd[index].startsWith(input)){
      cmd.val(available_cmd[index]);
      //console.log(available_cmd[index]);
      break;
    }
  }
}

function clear_console(){
  $('#executed_commands').empty();
  $('#terminal__prompt--command').val('');
}