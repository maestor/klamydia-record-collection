#!/bin/zsh
cd "${0:A:h}" || exit 1
if [[ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]]; then
  source "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
  nvm use --silent || exit 1
fi
npm run discogs:editor -- --open
