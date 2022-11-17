import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import * as DOMPurify from 'dompurify';

const config = {
  appName: 'Mastodon De-Mob-v0.9.0',
  appSite: window.location.origin + window.location.pathname,
  scope: 'read:accounts write:blocks read:search',
};

const global = window;
global.toBlock = 'unset';

const init = function init() {
  setupEventListeners();
  // Wait for the user to submit their instance, then run all functions
  if (window.location.search) {
    // if the authorization_code code has been returned, it will be in the URL
    getAuthToken();
    // Then, clean up the URL
    window.history.pushState({}, '', config.appSite);
    showTootPicker();
  }
};

const setupEventListeners = function setupEventListeners() {
  document.querySelector('.form--auth')
    .addEventListener('submit', (e) => {
      let url = document.querySelector('.input--auth').value;
      url = url.toLowerCase().trim();
      if (!/https/.test(url)) { url = `https://${url}`; }
      // This breaks on http sites.  But Mastodon doesn't federate with http sites

      window.localStorage.setItem('baseUrl', url);
      e.preventDefault();
      getClientSecret();
    });
  document.querySelector('.form--pick-toot')
    .addEventListener('submit', (e) => {
      let tootUrl = document.querySelector('.input--pick-toot').value;
      getTootContent(tootUrl).then((result) => {
        if (!result) {
          document.querySelector('.error--toot-not-found').style.display = 'block';
        }
      });

      e.preventDefault();
    });
  document.querySelector('.button--abort')
    .addEventListener('click', () => window.location.reload(true));
  document.querySelector('.button--block-all')
    .addEventListener('click', blockAll);
};

const getClientSecret = function getClientSecret() {
  const xhr = new XMLHttpRequest();
  xhr.open('POST',
    `${window.localStorage.getItem('baseUrl')}/api/v1/apps`,
    true);

  xhr.onerror = () => {
    document.querySelector('.alert__error').style.display = 'block';
  };

  const params = new FormData();
  params.append('client_name', config.appName);
  params.append('scopes', config.scope);
  params.append('redirect_uris', config.appSite);
  xhr.onerror = showError;
  xhr.onreadystatechange = () => {
    if (
      xhr.readyState === XMLHttpRequest.DONE
      && xhr.status === 200
    ) {
      const clientId = JSON.parse(xhr.responseText).client_id;
      const clientSecret = JSON.parse(xhr.responseText).client_secret;
      window.localStorage.setItem(`${config.appName}clientId`, clientId);
      window.localStorage.setItem(`${config.appName}clientSecret`, clientSecret);
      auth();
    }
  };
  xhr.send(params);
};

const auth = function authorizeApplication() {
  const url = `${window.localStorage.getItem('baseUrl')}/oauth/authorize?`
    + `scope=${config.scope}&`
    + 'response_type=code&'
    + `redirect_uri=${config.appSite}&`
    + `client_id=${window.localStorage.getItem(`${config.appName}clientId`)}&`
    + `client_secret=${window.localStorage.getItem(`${config.appName}clientSecret`)}&`;
  window.location.href = url;
};

const getAuthToken = function useAuthCodeToGetAuthToken() {
  window.localStorage.setItem(`${config.appName}t5AuthCode`,
    window.location.search.split('=')[1]);
  const xhr = new XMLHttpRequest();
  xhr.open('POST',
    `${window.localStorage.getItem('baseUrl')}/oauth/token`,
    true);

  const params = new FormData();
  params.append('client_id',
    window.localStorage.getItem(`${config.appName}clientId`));
  params.append('client_secret',
    window.localStorage.getItem(`${config.appName}clientSecret`));
  params.append('grant_type', 'authorization_code');
  params.append('code', window.localStorage.getItem(`${config.appName}t5AuthCode`));
  params.append('redirect_uri', config.appSite);

  xhr.onerror = showError;
  xhr.onreadystatechange = () => {
    if (
      xhr.readyState === XMLHttpRequest.DONE
      && xhr.status === 200
    ) {
      const authToken = JSON.parse(xhr.responseText).access_token;
      window.localStorage.setItem(`${config.appName}token`, authToken);
    }
  };
  xhr.send(params);
};

const showTootPicker = function showTootPickerInsteadOfInstancePicker() {
  document.querySelector('.form--auth').style.display = 'none';
  document.querySelectorAll('.login__auth').forEach((el) => {
    el.style.display = 'none';
  });
  document.querySelector('.form--pick-toot').style.display = 'block';
  document.querySelector('.login__pick-toot').style.display = 'block';
};

const getTootContent = async function getTootContentOfSuppliedToot(tootInput) {
  const tootId = /[^/]\/(\d+)/.exec(tootInput)[1];
  if (!tootId) {
    return false;
  }

  const tootUrl = new URL(tootInput);

  const tootApiUrl = `${tootUrl.origin}/api/v1/statuses/${tootId}`;
  const response = await fetch(tootApiUrl);
  const jsonResponse = await response.json();

  const canonicalTootUrl = new URL(jsonResponse.url);
  const canonicalTootId = /[^/]\/(\d+)/.exec(jsonResponse.url)[1];
  const canonicalTootApiUrl = canonicalTootId && `${canonicalTootUrl.origin}/api/v1/statuses/${canonicalTootId}`;

  let tootContent = <>
    <div className="card--toot-header">
      <img src={jsonResponse.account.avatar_static} className="toot-header__img" />
      <strong>{DOMPurify.sanitize(jsonResponse.account.display_name)}</strong> 
      <br />
      @{jsonResponse.account.acct}
    </div>

    <div dangerouslySetInnerHTML={{__html: DOMPurify.sanitize(jsonResponse.spoiler_text)}} />

    <div dangerouslySetInnerHTML={{__html: DOMPurify.sanitize(jsonResponse.content)}} />

    {(jsonResponse.media_attachments || []).map((img) => {
      <img src={img.preview_url} />
    })}
  </>;

  document.querySelector('.content__login').style.display = 'none';
  document.querySelector('.content__results').style.display = 'block';
  const root = ReactDOM.createRoot(document.querySelector('.results--target-toot'));
  root.render(tootContent);

  const toBlock = {};

  await Promise.all([
    fetchAccounts(toBlock, `${tootApiUrl}/reblogged_by`),
    fetchAccounts(toBlock, `${tootApiUrl}/favourited_by`),
    fetchAccounts(toBlock, `${canonicalTootApiUrl}/reblogged_by`),
    fetchAccounts(toBlock, `${canonicalTootApiUrl}/favourited_by`)
  ]);

  global.toBlock = toBlock;

  return true;
};

const fetchAccounts = async function (toBlock, url) {
    try {
      const response = await fetch(url);
      const jsonResponse = await response.json();
      for (const account of jsonResponse) {
        if (!toBlock[account.acct]) {
          const localSearchUrl = `${window.localStorage.getItem('baseUrl')}/api/v2/search?type=accounts&limit=1&q=${account.acct}`;
          const response = await fetch(localSearchUrl, {headers: {
            'Authorization': `Bearer ${window.localStorage.getItem(`${config.appName}token`)}`
          }});
          const jsonResponse = await response.json();
          toBlock[account.acct] = jsonResponse.accounts[0];
        }
      }
    } catch (e) {
      console.error(`failed to get accounts from ${url}: ${e}`);
    }
};

const blockAll = function blockAllToots() {
  if (global.toBlock === 'unset') {
    alert("Please wait until lists are loaded. check browser console for errors");
    return;
  }

  const accountsToBlock = Object.keys(global.toBlock).length;
  displayLoading(accountsToBlock);
  let numberOfBlockedAccounts = 0;

  Object.values(global.toBlock).forEach((account) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST',
      `${window.localStorage.getItem('baseUrl')}/api/v1/accounts/${account.id}/block`,
      true);
    const accessToken = `Bearer ${window.localStorage.getItem(`${config.appName}token`)}`;
    xhr.setRequestHeader('Authorization', accessToken);
    xhr.onreadystatechange = () => {
      if (
        xhr.readyState === XMLHttpRequest.DONE
        && xhr.status === 200
      ) {
        numberOfBlockedAccounts++;
        if (numberOfBlockedAccounts === accountsToBlock) {
          displayLoadingDone(accountsToBlock);
        }
      }
    };
    xhr.send();
  });
};

const displayLoading = function displayLoadingProgressPage(number) {
  document.querySelector('.content__results').style.display = 'none';
  document.querySelector('.content__loading').style.display = 'block';
  if (number === 1) {
    document.querySelector('.js-number-of-blocked-accounts')
      .innerHTML = `${number} account`;
  } else {
    document.querySelector('.js-number-of-blocked-accounts')
      .innerHTML = `${number} accounts`;
  }
};

const displayLoadingDone = function displayLoadingDone(number) {
  document.querySelector('.loading--in-progress').style.display = 'none';
  document.querySelector('.loading--done').style.display = 'block';
  if (number === 1) {
    document.querySelector('.js-number-of-blocked-accounts')
      .innerHTML = `${number} account blocked!`;
  } else {
    document.querySelector('.js-number-of-blocked-accounts')
      .innerHTML = `All ${number} accounts blocked!`;
  }
};

const showError = function showErrorForUnknownFailureInHttpRequest() {
  document.querySelector('.error--unknown').style.display = 'block';
};

init();
