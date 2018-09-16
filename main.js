const config = {
  appName: 'Mastodon De-Mob-v0.9.0',
  appSite: 'https://mastodon-de-mob.codesections.com',
  scope: 'read:accounts write:blocks write:reports',
};
const global = {
  tootId: 'unset',
  accountId: 'unset',
  favoratedBy: 'unset',
  boostedBy: 'unset',
};

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
      let tootId = document.querySelector('.input--pick-toot').value;
      if (/[^/]\/(\d+)/.test(tootId)) {
        tootId = /[^/]\/(\d+)/.exec(tootId)[1];
        getTootContent(tootId);
      } else {
        document.querySelector('.error--toot-not-found').style.display = 'block';
      }

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

const getTootContent = function getTootContentOfSuppliedToot(tootId) {
  const xhr = new XMLHttpRequest();
  xhr.open('GET',
    `${window.localStorage.getItem('baseUrl')}/api/v1/statuses/${tootId}`,
    true);

  xhr.onerror = showError;
  xhr.onreadystatechange = () => {
    if (
      xhr.readyState === XMLHttpRequest.DONE
      && xhr.status === 200
    ) {
      const response = JSON.parse(xhr.responseText);
      global.tootId = tootId;
      global.accountId = response.account.id;
      let tootContent = `
      <div class="card--toot-header">
        <img src="${response.account.avatar_static}" class="toot-header__img">
        <strong>${response.account.display_name}</strong> 
        <br>
        @${response.account.acct}
      </div>
      ${response.spoiler_text}
      ${response.content}`;
      if (response.media_attachments) {
        response.media_attachments.forEach((img) => {
          tootContent += `<img src="${img.preview_url}">`;
        });
      }

      document.querySelector('.content__login').style.display = 'none';
      document.querySelector('.content__results').style.display = 'block';
      document.querySelector('.results--target-toot').innerHTML = tootContent;
      getFavedBy(tootId);
      getBoostedBy(tootId);
    }
  };
  xhr.send();
};

const getFavedBy = function getAllTootsThatFavoratedSuppliedToot(tootId) {
  const xhr = new XMLHttpRequest();
  xhr.open('GET',
    `${window.localStorage.getItem('baseUrl')}/api/v1/statuses/${tootId}/favourited_by`,
    true);

  xhr.onerror = showError;
  xhr.onreadystatechange = () => {
    if (
      xhr.readyState === XMLHttpRequest.DONE
      && xhr.status === 200
    ) {
      global.favoratedBy = [];
      JSON.parse(xhr.responseText).forEach((account) => {
        global.favoratedBy.push(account.id);
      });
    }
  };
  xhr.send();
};

const getBoostedBy = function getAllTootsThatBoostedSuppliedToot(tootId) {
  const xhr = new XMLHttpRequest();
  xhr.open('GET',
    `${window.localStorage.getItem('baseUrl')}/api/v1/statuses/${tootId}/reblogged_by`,
    true);

  xhr.onerror = showError;
  xhr.onreadystatechange = () => {
    if (
      xhr.readyState === XMLHttpRequest.DONE
      && xhr.status === 200
    ) {
      global.boostedBy = [];
      JSON.parse(xhr.responseText).forEach((account) => {
        global.boostedBy.push(account.id);
      });
    }
  };
  xhr.send();
};

const blockAll = function blockAllToots() {
  if (global.favoratedBy === 'unset' || global.boostedBy === 'unset') {
    window.setInterval(blockAll, 200);
    return;
  }

  const accountsToBlock = new Set();

  global.boostedBy.forEach(id => accountsToBlock.add(id));
  global.favoratedBy.forEach(id => accountsToBlock.add(id));

  displayLoading(accountsToBlock.size);
  let numberOfBlockedAccounts = 0;


  const xhr = new XMLHttpRequest();
  accountsToBlock.forEach((account) => {
    xhr.open('POST',
      `${window.localStorage.getItem('baseUrl')}/api/v1/accounts/${account}/block`,
      true);
    const accessToken = `Bearer ${window.localStorage.getItem(`${config.appName}token`)}`;
    xhr.setRequestHeader('Authorization', accessToken);
    xhr.onreadystatechange = () => {
      if (
        xhr.readyState === XMLHttpRequest.DONE
        && xhr.status === 200
      ) {
        numberOfBlockedAccounts++;
        if (numberOfBlockedAccounts === accountsToBlock.size) {
          displayLoadingDone(accountsToBlock.size);
        }
      }
    };
    xhr.send();
  });

  reportBlocking();
};

const reportBlocking = function reportBlockingToModerators() {
  const xhr = new XMLHttpRequest();

  xhr.open('POST',
    `${window.localStorage.getItem('baseUrl')}/api/v1/reports`,
    true);

  const params = new FormData();
  params.append('account_id', global.accountId);
  params.append('status_ids', `[${global.tootId}]`);
  params.append('comment', 'This toot is harassment, and I have blocked all the users who boosted or favorited it using the Mastodon De-Mob tool.');
  const accessToken = `Bearer ${window.localStorage.getItem(`${config.appName}token`)}`;
  xhr.setRequestHeader('Authorization', accessToken);
  xhr.send(params);
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
