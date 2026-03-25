import React from 'react';
import { Input, Spin } from 'antd';
import { SearchOutlined, LoadingOutlined } from '@ant-design/icons';

const { Search } = Input;

/**
 * 搜索栏组件
 */
const SearchBar = ({ value, onChange, placeholder = 'Search...', loading = false }) => {
  return (
    <Search
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      allowClear
      enterButton={loading ? <LoadingOutlined /> : <SearchOutlined />}
      loading={loading}
      style={{ width: '100%' }}
    />
  );
};

export default SearchBar;
