const assert=require('node:assert/strict');const {transform}=require('./app-shell');
let s=transform('<!doctype html><html><head></head><body><header><nav>old</nav></header><main>hello</main></body></html>');
assert(s.includes('My dashboard'));assert(s.includes('app-design.css'));assert(s.includes('id="main-content"'));assert(!s.includes('Team settings'));assert(!s.includes('<nav>old'));
s=transform('<!doctype html><html><header>MANAGER · Alex<nav>old</nav></header><main>hello</main></html>');assert(s.includes('Team settings'));
s=transform('<!doctype html><html><head></head><body><header>Login</header><main>Login</main></body></html>');assert(!s.includes('Sign out'));assert(s.includes('Skip to main content'));assert.equal(transform('ok'),'ok');
console.log('10 shell assertions passed');