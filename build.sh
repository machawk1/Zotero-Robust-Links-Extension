#!/bin/bash

zip -r extension.xpi chrome
zip -ur extension.xpi install.rdf
zip -ur extension.xpi chrome.manifest
