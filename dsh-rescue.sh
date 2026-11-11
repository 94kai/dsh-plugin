#!/bin/sh
export PATH="/home/xuekai/.local/share/fnm/node-versions/v26.7.0/installation/bin:/home/xuekai/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

pm2 start /home/xuekai/.local/share/fnm/node-versions/v26.7.0/installation/bin/npx \
  --name dsh-rescue \
  --interpreter none \
  --time \
  -- --yes @deepseek-ai/dsh --profile rescue \
  --no-open \
  --port 2008
