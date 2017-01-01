#!/bin/bash

rm -f browser-app.js && browserify src/* > browser-app.js
