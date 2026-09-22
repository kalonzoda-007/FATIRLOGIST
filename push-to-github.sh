#!/bin/bash
cd /data/data/com.termux/files/home/projects/FATIRLOGIST
git remote add origin https://github.com/kalonzoda-007/FATIRLOGIST 2>/dev/null || true
git branch -M master
git push -u origin master
