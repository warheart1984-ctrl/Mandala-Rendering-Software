import { Timeline } from "./Timeline.js";

export class TimelineSerializer {
  static serialize(timeline) {
    return JSON.stringify(timeline.toJSON(), null, 2);
  }

  static deserialize(json, targetResolver) {
    const data = typeof json === "string" ? JSON.parse(json) : json;
    return Timeline.fromJSON(data, targetResolver);
  }

  static saveToFile(timeline, filePath) {
    const fs = require("fs");
    fs.writeFileSync(filePath, this.serialize(timeline), "utf-8");
  }

  static loadFromFile(filePath, targetResolver) {
    const fs = require("fs");
    const json = fs.readFileSync(filePath, "utf-8");
    return this.deserialize(json, targetResolver);
  }
}
