module.exports = async function (context) {
  await context.route("https://js.hcaptcha.com/1/api.js**", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.hcaptcha={render(element,options){const button=document.createElement('button');button.type='button';button.textContent='Tôi là con người';button.onclick=()=>options.callback('10000000-aaaa-bbbb-cccc-000000000001');element.appendChild(button);return 'fixture';},remove(){}};window.__reownHcaptchaReady();`,
    }),
  );
};
