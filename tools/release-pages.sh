#!/bin/sh
# The site and the relay are one Worker now. This name remains so an old publish command still does the right deploy.
exec "$(dirname "$0")/release.sh"
