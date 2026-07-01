#!/bin/bash
# Deploy the unified Containerlab topology
cd "$(dirname "$0")"
sudo containerlab deploy -t topology.clab.yml
