#!/bin/bash
# Destroy the unified Containerlab topology
cd "$(dirname "$0")"
sudo containerlab destroy -t topology.clab.yml
