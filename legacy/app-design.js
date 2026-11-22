'use strict';
document.querySelectorAll('nav a').forEach(a=>{if(a.pathname===location.pathname)a.setAttribute('aria-current','page')});
const help=document.getElementById('phone-help');
const toggle=document.querySelector('.install-help');
if(help&&toggle){toggle.addEventListener('click',()=>{help.hidden=!help.hidden;toggle.setAttribute('aria-expanded',String(!help.hidden));if(!help.hidden)help.querySelector('button').focus()});help.querySelector('.close-help').addEventListener('click',()=>{help.hidden=true;toggle.setAttribute('aria-expanded','false');toggle.focus()})}
document.querySelectorAll('input[type="email"]').forEach(e=>{e.autocomplete='email';e.autocapitalize='none';e.spellcheck=false});
document.querySelectorAll('input[type="password"]').forEach(e=>{e.autocomplete=(e.name==='next'?'new-password':'current-password')});
