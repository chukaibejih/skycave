import { Config } from "@remotion/cli/config";

// h264 mp4 is the default; make it explicit so the output is predictable.
Config.setVideoImageFormat("jpeg");
Config.setCodec("h264");
Config.setConcurrency(4);
