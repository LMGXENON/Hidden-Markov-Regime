#!/usr/bin/env python3
import argparse
import json
import sys

import numpy as np
import yfinance as yf


def fetch_series(symbol: str, period: str, interval: str):
    df = yf.download(symbol, period=period, interval=interval, auto_adjust=True, progress=False)
    if df is None or df.empty:
        raise ValueError(f"No data for {symbol}")
    df = df[["Close"]].dropna()
    close = df["Close"].to_numpy(dtype=float)
    if close.size < 2:
        raise ValueError(f"Not enough data for {symbol}")
    returns = np.zeros_like(close)
    returns[1:] = np.log(close[1:] / close[:-1])
    dates = df.index.strftime("%Y-%m-%d").tolist()
    return dates, close.tolist(), returns.tolist()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--symbol", required=True)
    parser.add_argument("--period", default="5y")
    parser.add_argument("--interval", default="1d")
    args = parser.parse_args()

    try:
        dates, prices, returns = fetch_series(args.symbol, args.period, args.interval)
    except Exception as exc:
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)

    print(
        json.dumps(
            {
                "symbol": args.symbol,
                "dates": dates,
                "prices": prices,
                "returns": returns,
            }
        )
    )


if __name__ == "__main__":
    main()
